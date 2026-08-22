/* POST /api/agenda
 *
 * O agendamento de retorno: "ligar de novo dia 26 às 14h30".
 *
 * Guardado sob VENDEDOR, como o caderno -- e pela mesma razao: o cliente que
 * mudar de mao numa rodada nova nao leva junto o compromisso de quem estava
 * com ele antes.
 *
 * `quando` chega e sai sempre em ISO UTC. Quem converte a hora digitada e o
 * navegador do vendedor, com o fuso do proprio aparelho: Belem, Manaus e Rio
 * Branco estao em horas diferentes, e "avisar 30 minutos antes" so quer
 * dizer alguma coisa se o instante for absoluto.
 *
 * Acoes:
 *   listar (padrao)  -> os compromissos futuros do vendedor
 *   somar            -> cria um
 *   apagar           -> remove um
 *   concluir         -> marca como feito (some da lista, fica no historico)
 */

import { lojaAgenda, vendedorDoToken, gravarComTrava, json } from '../lib/loja.mjs';
import { emailLigado } from '../lib/email.mjs';

export const config = { path: '/api/agenda' };

const MAX_OBS = 300;
const MAX_ABERTOS = 500;
// Um ano a frente ja e mais do que qualquer retorno de venda. O limite existe
// para um relogio errado nao encher a agenda de compromissos em 2087.
const MAX_ADIANTE = 365 * 24 * 60 * 60 * 1000;

function novoId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/* Aceita ISO com fuso; devolve ISO UTC ou null. Recusa passado e recusa
   longe demais -- as duas coisas viram lembrete que nunca serve. */
function quandoValido(s) {
  const t = Date.parse(String(s || ''));
  if (!Number.isFinite(t)) return null;
  const agora = Date.now();
  if (t <= agora) return null;
  if (t > agora + MAX_ADIANTE) return null;
  return new Date(t).toISOString();
}

function abertos(tudo) {
  const agora = Date.now();
  return Object.keys(tudo)
    .map((id) => ({ id, ...tudo[id] }))
    .filter((a) => !a.feitoEm && Date.parse(a.quando) > agora - 6 * 60 * 60 * 1000)
    .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
}

export default async function agenda(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const dono = await vendedorDoToken(corpo?.token);
  if (!dono) return json({ erro: 'Link inválido.' }, 404);

  const loja = lojaAgenda();
  const chave = dono.chave;
  const acao = String(corpo.acao || 'listar');

  // `avisa` diz a tela se o lembrete vai mesmo sair. Sem chave de e-mail no
  // site, ou sem endereco cadastrado para este vendedor, o compromisso e
  // salvo do mesmo jeito -- mas a tela nao promete e-mail nenhum.
  const avisa = emailLigado() && !!String(dono.doc?.email || '').trim();

  if (acao === 'listar') {
    const tudo = (await loja.get(chave, { type: 'json' })) || {};
    return json({ agenda: abertos(tudo), avisa });
  }

  if (acao === 'somar') {
    const cliente = String(corpo.cliente || '').trim().slice(0, 120);
    if (!cliente) return json({ erro: 'Falta o cliente.' }, 400);

    const quando = quandoValido(corpo.quando);
    if (!quando) return json({ erro: 'Escolha uma data e hora no futuro.' }, 400);

    const registro = {
      cliente,
      nome: String(corpo.nome || '').trim().slice(0, 200),
      quando,
      // Fuso de quem agendou, so para o e-mail mostrar a hora que ele
      // digitou. O instante ja esta resolvido em `quando`.
      fuso: String(corpo.fuso || '').trim().slice(0, 60),
      obs: String(corpo.obs || '').trim().slice(0, MAX_OBS),
      criadoEm: Date.now(),
    };

    const r = await gravarComTrava(loja, chave, (tudo) => {
      if (abertos(tudo).length >= MAX_ABERTOS) return null;
      tudo[novoId()] = registro;
      return tudo;
    });
    if (!r.ok) return json({ erro: 'Não consegui salvar agora. Tente de novo.' }, 409);
    return json({ agenda: abertos(r.dados), avisa });
  }

  if (acao === 'apagar' || acao === 'concluir') {
    const id = String(corpo.id || '').trim();
    if (!/^[a-f0-9]{16}$/.test(id)) return json({ erro: 'Compromisso inválido.' }, 400);

    const r = await gravarComTrava(loja, chave, (tudo) => {
      if (!tudo[id]) return null;
      if (acao === 'apagar') delete tudo[id];
      else tudo[id].feitoEm = Date.now();
      return tudo;
    });
    if (!r.ok) {
      return json({ erro: r.motivo === 'disputa'
        ? 'Não consegui salvar agora. Tente de novo.'
        : 'Esse compromisso não existe mais.' }, r.motivo === 'disputa' ? 409 : 404);
    }
    return json({ agenda: abertos(r.dados), avisa });
  }

  return json({ erro: 'Ação desconhecida.' }, 400);
}
