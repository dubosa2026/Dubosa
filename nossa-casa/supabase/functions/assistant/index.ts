// Nossa Casa IA — Supabase Edge Function (Deno).
//
// Recebe { question, today, member_id } do app, conversa com o Claude e deixa
// o modelo consultar o banco por ferramentas. As consultas usam o login de
// quem perguntou (JWT), então valem as mesmas regras de segurança (RLS): a IA
// só enxerga a casa da própria família e nunca altera nada.
//
// Publicar:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy assistant
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-opus-5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_members',
    description: 'Lista as pessoas da casa (adultos e crianças) com id, nome e tipo.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_tasks',
    description:
      'Tarefas (ocorrências) entre duas datas, inclusive. Retorna título, data, horário, responsáveis, status (pending/done/cancelled), categoria, prioridade, minutos, esforço (1-3) e tipo (chore, mission=missão de criança, coverage=cobertura das crianças, homework, market).',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', enum: ['pending', 'done', 'any'] },
      },
      required: ['start_date', 'end_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_shopping_list',
    description: 'Itens da lista de compras compartilhada (nome, quantidade, observação, comprado ou não).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_homework',
    description: 'Lições de casa registradas (atividade, matéria, prazo, concluída).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_family_events',
    description: 'Passeios em família e compromissos a partir de uma data.',
    input_schema: {
      type: 'object',
      properties: { from_date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['from_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_reorganize',
    description:
      'Use quando pedirem para organizar/reorganizar a semana. O app então calcula a nova distribuição e pede confirmação ao usuário (a IA não aplica mudanças).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

async function runTool(sb: SupabaseClient, householdId: string, name: string, input: Record<string, unknown>, state: { action?: string }) {
  const names = new Map<string, string>();
  const { data: members } = await sb.from('members').select('id,name,kind').eq('household_id', householdId).eq('deleted', false);
  for (const m of members ?? []) names.set(m.id, m.name);
  const who = (ids: string[]) => ids.map((id) => names.get(id) ?? '?');

  switch (name) {
    case 'get_members':
      return members ?? [];
    case 'get_tasks': {
      let q = sb
        .from('task_instances')
        .select('title,date,due_time,assignee_ids,status,category,priority,minutes,effort,kind,completed_by')
        .eq('household_id', householdId)
        .eq('deleted', false)
        .gte('date', String(input.start_date))
        .lte('date', String(input.end_date))
        .order('date')
        .limit(400);
      if (input.status === 'pending' || input.status === 'done') q = q.eq('status', input.status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((t) => ({ ...t, assignee_ids: undefined, responsaveis: who(t.assignee_ids), completed_by: who(t.completed_by) }));
    }
    case 'get_shopping_list': {
      const { data } = await sb.from('shopping_items').select('name,quantity,note,bought').eq('household_id', householdId).eq('deleted', false);
      return data ?? [];
    }
    case 'get_homework': {
      const { data } = await sb.from('homework').select('activity,subject,due_date,note,done,child_id').eq('household_id', householdId).eq('deleted', false);
      return (data ?? []).map((h) => ({ ...h, crianca: names.get(h.child_id), child_id: undefined }));
    }
    case 'get_family_events': {
      const { data } = await sb.from('family_events').select('type,title,place_type,date,time,done').eq('household_id', householdId).eq('deleted', false).gte('date', String(input.from_date)).order('date');
      return data ?? [];
    }
    case 'suggest_reorganize':
      state.action = 'reorganize';
      return { ok: true, message: 'O app vai mostrar a nova distribuição para o usuário confirmar.' };
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Faça login.' }, 401);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await sb.auth.getUser();
    if (!userData.user) return json({ error: 'Sessão inválida.' }, 401);
    const { data: me } = await sb.from('members').select('id,name,household_id').eq('user_id', userData.user.id).maybeSingle();
    if (!me) return json({ error: 'Você ainda não faz parte de uma casa.' }, 403);

    const { question, today } = (await req.json()) as { question?: string; today?: string };
    if (!question || question.length > 2000) return json({ error: 'Pergunta inválida.' }, 400);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(today ?? '') ? today! : new Date().toISOString().slice(0, 10);

    const client = new Anthropic(); // lê ANTHROPIC_API_KEY dos segredos da função
    const system =
      'Você é a "Nossa Casa IA", assistente da rotina da família de Eduardo e Jussara (dois adultos com o mesmo papel, sem hierarquia) e das crianças. ' +
      'Responda em português do Brasil, de forma curta, calorosa e prática, com listas simples quando ajudar. ' +
      'Sempre consulte as ferramentas para obter os dados reais antes de responder; nunca invente tarefas. ' +
      'Não crie competição entre o casal nem use linguagem de cobrança: fale de equilíbrio e cooperação. ' +
      'Regras da casa: quem cozinha lava a louça e limpa o fogão; quem lava a louça não faz a rotina de sono; tarefas "coverage" são o outro adulto cuidando das crianças ao mesmo tempo. ' +
      'Você não altera dados; para reorganizar a semana use a ferramenta suggest_reorganize.';
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: `Hoje é ${day}. Quem pergunta é ${me.name}.\n\n${question}` },
    ];
    const state: { action?: string } = {};

    for (let turn = 0; turn < 8; turn++) {
      const params = {
        model: MODEL,
        max_tokens: 16000,
        system,
        tools,
        messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      };
      const response = await client.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);

      if (response.stop_reason === 'refusal') {
        return json({ answer: 'Não consegui responder essa pergunta. Tente perguntar de outro jeito. 🙂' });
      }
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !toolUses.length) {
        const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
        return json({ answer: text || 'Pronto.', action: state.action });
      }
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (t) => {
          try {
            const out = await runTool(sb, me.household_id, t.name, (t.input ?? {}) as Record<string, unknown>, state);
            return { type: 'tool_result' as const, tool_use_id: t.id, content: JSON.stringify(out) };
          } catch (e) {
            return { type: 'tool_result' as const, tool_use_id: t.id, content: String((e as Error).message), is_error: true };
          }
        }),
      );
      messages.push({ role: 'user', content: results });
    }
    return json({ answer: 'A pergunta ficou longa demais para responder agora. Tente algo mais específico.', action: state.action });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Chave da Anthropic inválida ou ausente.' }, 500);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Muitas perguntas seguidas. Tente em instantes.' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `Erro da IA (${e.status}).` }, 502);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
