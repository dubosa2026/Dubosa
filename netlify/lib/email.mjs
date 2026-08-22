/* Envio de e-mail pela API do Brevo.
 *
 * Escolhido porque nao pede nada no DNS da belenergy.com.br: basta confirmar
 * um endereco de remetente clicando num link. Sao 300 e-mails por dia no
 * plano gratuito -- com 22 vendedores e alguns agendamentos por dia, sobra.
 *
 * Tres variaveis, todas em Site settings -> Environment variables:
 *   BREVO_API_KEY     a chave da conta
 *   EMAIL_REMETENTE   o endereco confirmado no Brevo
 *   EMAIL_GESTOR      para onde vai o resumo diario
 *
 * Sem BREVO_API_KEY nada quebra: o agendamento continua sendo salvo e lido
 * na tela, so nao sai lembrete. A tela avisa isso ao vendedor em vez de
 * prometer um e-mail que nunca chegaria.
 */

const API = 'https://api.brevo.com/v3/smtp/email';

export function emailLigado() {
  return !!(process.env.BREVO_API_KEY && process.env.EMAIL_REMETENTE);
}

export async function enviarEmail({ para, nome, assunto, html, texto }) {
  const chave = process.env.BREVO_API_KEY;
  const remetente = process.env.EMAIL_REMETENTE;
  if (!chave || !remetente) return { ok: false, motivo: 'sem configuracao' };

  const destino = String(para || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
    return { ok: false, motivo: 'endereco invalido' };
  }

  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: {
        'api-key': chave,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'BelEnergy — Distribuição de Carteira', email: remetente },
        to: [{ email: destino, name: String(nome || destino).slice(0, 80) }],
        subject: String(assunto || '').slice(0, 180),
        htmlContent: html,
        textContent: texto,
      }),
    });
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '');
      return { ok: false, motivo: `brevo ${r.status}`, detalhe: detalhe.slice(0, 300) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: String((e && e.message) || e).slice(0, 200) };
  }
}

/* Um so lugar para o visual dos e-mails. Tabela e estilo em linha porque
   cliente de e-mail ignora folha de estilo, e muitos ignoram ate flexbox. */
export function moldura(titulo, corpo) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F4F4F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:22px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:10px;overflow:hidden;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:#0A0A0B;padding:15px 22px;">
<span style="color:#FFC72C;font-weight:700;font-size:15px;letter-spacing:.02em;">BELENERGY</span>
<span style="color:#8A8A8F;font-size:12px;"> &nbsp;|&nbsp; ${titulo}</span>
</td></tr>
<tr><td style="padding:22px;color:#1A1A1C;font-size:14px;line-height:1.6;">${corpo}</td></tr>
<tr><td style="padding:13px 22px;background:#FAFAFA;color:#8A8A8F;font-size:11px;line-height:1.5;">
Enviado automaticamente pelo aplicativo de distribuição de carteira. Não responda este e-mail.
</td></tr>
</table></td></tr></table></body></html>`;
}
