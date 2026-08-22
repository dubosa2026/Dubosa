/* Funcao agendada: roda de 5 em 5 minutos e manda o lembrete de 30 minutos.
 *
 * Como acha o que enviar: percorre os cadernos de agenda (um por vendedor),
 * pega o que comeca dentro dos proximos 30 minutos e ainda nao foi avisado.
 * Com a equipe atual sao poucas leituras por rodada.
 *
 * Duas garantias que importam mais que o resto:
 *
 * 1. NAO AVISA DUAS VEZES. `avisadoEm` e gravado com escrita condicional
 *    ANTES do envio. Se duas execucoes se cruzarem, so uma consegue marcar.
 *    Preferir um lembrete perdido a tres iguais na caixa de entrada.
 *
 * 2. NAO AVISA ATRASADO. Compromisso que ja passou nao gera e-mail: se o
 *    site ficou fora do ar, avisar as 15h de uma ligacao das 14h nao ajuda
 *    ninguem e ainda confunde. Ele so e marcado para nao voltar.
 */

import { lojaAgenda, lojaCarteiras, lojaTokens, gravarComTrava } from '../lib/loja.mjs';
import { enviarEmail, emailLigado, moldura } from '../lib/email.mjs';

export const config = { schedule: '*/5 * * * *' };

const ANTECEDENCIA = 30 * 60 * 1000;

/* Hora de Brasilia para o texto do e-mail. O Norte tem UF em UTC-4 e UTC-5,
   mas o compromisso foi digitado na hora local de quem agendou e guardado em
   UTC -- aqui so precisamos mostrar de volta algo reconhecivel, e o fuso do
   proprio vendedor vem gravado no registro quando o navegador manda. */
function horaLocal(iso, fuso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: fuso || 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
  }
}

function corpoDoLembrete(a, fuso) {
  const quando = horaLocal(a.quando, fuso);
  const nome = a.nome || a.cliente;
  return moldura('Lembrete de agendamento', `
<p style="margin:0 0 14px;font-size:16px;"><b>Daqui a 30 minutos:</b> ${escapar(nome)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
<tr><td style="padding:3px 14px 3px 0;color:#8A8A8F;font-size:13px;">Horário</td>
    <td style="padding:3px 0;font-size:13px;"><b>${escapar(quando)}</b></td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#8A8A8F;font-size:13px;">Código</td>
    <td style="padding:3px 0;font-size:13px;">${escapar(a.cliente)}</td></tr>
</table>
${a.obs ? `<p style="margin:0 0 16px;padding:10px 12px;background:#FAFAFA;border-left:3px solid #FFC72C;font-size:13px;">${escapar(a.obs)}</p>` : ''}
<p style="margin:0;color:#8A8A8F;font-size:12.5px;">Abra o seu link para ver o roteiro e as suas anotações deste cliente.</p>`);
}

function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function lembretes() {
  if (!emailLigado()) {
    return new Response('e-mail não configurado; nada a enviar', { status: 200 });
  }

  const agenda = lojaAgenda();
  const tokens = lojaTokens();
  const carteiras = lojaCarteiras();

  let chaves = [];
  try {
    const { blobs } = await agenda.list();
    chaves = (blobs || []).map((b) => b.key);
  } catch (e) {
    return new Response('não consegui listar a agenda: ' + e.message, { status: 500 });
  }

  const agora = Date.now();
  const limite = agora + ANTECEDENCIA;
  let enviados = 0, vencidos = 0, falhas = 0;

  for (const chave of chaves) {
    const tudo = (await agenda.get(chave, { type: 'json' })) || {};

    const naJanela = Object.keys(tudo).filter((id) => {
      const a = tudo[id];
      if (!a || a.avisadoEm || a.feitoEm) return false;
      return Date.parse(a.quando) <= limite;
    });
    if (!naJanela.length) continue;

    // Endereco do vendedor: vem do documento publicado, nunca do navegador.
    let email = '';
    const token = await tokens.get(chave);
    if (token) {
      const doc = await carteiras.get(token, { type: 'json' });
      email = String(doc?.email || '').trim();
    }

    for (const id of naJanela) {
      const a = tudo[id];
      const passou = Date.parse(a.quando) <= agora;

      // Marca ANTES de enviar. Duas execucoes cruzadas: so uma marca.
      const marcou = await gravarComTrava(agenda, chave, (doc) => {
        if (!doc[id] || doc[id].avisadoEm) return null;
        doc[id].avisadoEm = Date.now();
        if (passou) doc[id].avisoPerdido = true;
        return doc;
      });
      if (!marcou.ok) continue;

      if (passou) { vencidos++; continue; }
      if (!email) continue;

      const r = await enviarEmail({
        para: email,
        nome: chave.replace(/-/g, ' '),
        assunto: `Em 30 min: ${a.nome || a.cliente}`,
        html: corpoDoLembrete(a, a.fuso),
        texto: `Daqui a 30 minutos: ${a.nome || a.cliente}\n` +
               `Horário: ${horaLocal(a.quando, a.fuso)}\n` +
               (a.obs ? `\n${a.obs}\n` : ''),
      });
      if (r.ok) enviados++;
      else falhas++;
    }
  }

  return new Response(
    `enviados: ${enviados} · vencidos sem aviso: ${vencidos} · falhas: ${falhas}`,
    { status: 200 });
}
