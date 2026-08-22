/* Funcao agendada: um e-mail por dia para o gestor, com os agendamentos da
 * equipe inteira para aquele dia.
 *
 * O vendedor recebe o lembrete de 30 minutos; o gestor recebe isto. A ideia e
 * enxergar o dia da equipe sem receber 40 lembretes soltos.
 *
 * Horario em RESUMO_HORA_UTC (padrao 11, que e 8h em Brasilia). Netlify roda
 * cron em UTC, entao o valor e em UTC de proposito -- horario de verao nao
 * existe mais no Brasil, entao a conta e fixa.
 *
 * Sem EMAIL_GESTOR nao envia nada e nao reclama: e um recurso opcional.
 */

import { lojaAgenda } from '../lib/loja.mjs';
import { enviarEmail, emailLigado, moldura } from '../lib/email.mjs';

const HORA = (() => {
  const v = parseInt(process.env.RESUMO_HORA_UTC || '', 10);
  return Number.isFinite(v) && v >= 0 && v <= 23 ? v : 11;
})();

export const config = { schedule: `0 ${HORA} * * *` };

const FUSO = 'America/Sao_Paulo';

function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hhmm(iso, fuso) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR',
      { timeZone: fuso || FUSO, hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

export default async function resumo() {
  const paraGestor = String(process.env.EMAIL_GESTOR || '').trim();
  if (!emailLigado() || !paraGestor) {
    return new Response('resumo desligado (falta EMAIL_GESTOR ou a chave)', { status: 200 });
  }

  const agenda = lojaAgenda();
  let chaves = [];
  try {
    const { blobs } = await agenda.list();
    chaves = (blobs || []).map((b) => b.key);
  } catch (e) {
    return new Response('não consegui listar a agenda: ' + e.message, { status: 500 });
  }

  // A janela do dia e contada no fuso de Brasilia, que e onde o gestor esta.
  const agora = new Date();
  const hojeBR = agora.toLocaleDateString('en-CA', { timeZone: FUSO });   // AAAA-MM-DD
  const doDia = [];

  for (const chave of chaves) {
    const tudo = (await agenda.get(chave, { type: 'json' })) || {};
    for (const id of Object.keys(tudo)) {
      const a = tudo[id];
      if (!a || a.feitoEm) continue;
      const dia = new Date(a.quando).toLocaleDateString('en-CA', { timeZone: FUSO });
      if (dia !== hojeBR) continue;
      doDia.push({ vendedor: chave.replace(/-/g, ' '), ...a });
    }
  }

  if (!doDia.length) {
    return new Response('nenhum agendamento hoje; nada enviado', { status: 200 });
  }

  doDia.sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));

  const linhas = doDia.map((a) => `
<tr>
  <td style="padding:7px 12px 7px 0;font-family:monospace;font-size:13px;color:#B8860B;white-space:nowrap;vertical-align:top;">${escapar(hhmm(a.quando, a.fuso))}</td>
  <td style="padding:7px 12px 7px 0;font-size:13px;vertical-align:top;">${escapar(a.vendedor)}</td>
  <td style="padding:7px 0;font-size:13px;vertical-align:top;">${escapar(a.nome || a.cliente)}${
    a.obs ? `<br><span style="color:#8A8A8F;font-size:12px;">${escapar(a.obs)}</span>` : ''}</td>
</tr>`).join('');

  const quantos = doDia.length;
  const equipe = new Set(doDia.map((a) => a.vendedor)).size;

  const html = moldura('Agendamentos de hoje', `
<p style="margin:0 0 16px;font-size:15px;"><b>${quantos}</b> ${quantos === 1 ? 'agendamento' : 'agendamentos'} hoje, de <b>${equipe}</b> ${equipe === 1 ? 'vendedor' : 'vendedores'}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
<tr><th align="left" style="padding:0 12px 6px 0;border-bottom:1px solid #E6E6E8;font-size:11px;color:#8A8A8F;text-transform:uppercase;letter-spacing:.05em;">Hora</th>
    <th align="left" style="padding:0 12px 6px 0;border-bottom:1px solid #E6E6E8;font-size:11px;color:#8A8A8F;text-transform:uppercase;letter-spacing:.05em;">Vendedor</th>
    <th align="left" style="padding:0 0 6px;border-bottom:1px solid #E6E6E8;font-size:11px;color:#8A8A8F;text-transform:uppercase;letter-spacing:.05em;">Cliente</th></tr>
${linhas}
</table>
<p style="margin:16px 0 0;color:#8A8A8F;font-size:12.5px;">Horários no fuso de Brasília. Cada vendedor recebe o próprio lembrete 30 minutos antes.</p>`);

  const texto = doDia.map((a) =>
    `${hhmm(a.quando, a.fuso)}  ${a.vendedor}  ${a.nome || a.cliente}`).join('\n');

  const r = await enviarEmail({
    para: paraGestor,
    nome: 'Gestor',
    assunto: `${quantos} ${quantos === 1 ? 'agendamento' : 'agendamentos'} hoje`,
    html,
    texto,
  });

  return new Response(r.ok ? `resumo enviado (${quantos})` : 'falhou: ' + r.motivo,
    { status: r.ok ? 200 : 502 });
}
