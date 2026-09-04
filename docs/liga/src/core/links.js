/**
 * OS LINKS DA EQUIPE, GUARDADOS NO APARELHO DO GESTOR
 * ==================================================
 *
 * O cadastro publicado guarda apenas o resumo (hash) de cada código — e isso
 * está certo: o arquivo é público, e de um resumo ninguém remonta o link de
 * ninguém.
 *
 * O erro era tirar disso a conclusão de que o gestor também não podia ter os
 * links. Ele podia: são os links que ele mesmo distribui. Sem guardá-los, a
 * tela mostrava "link exibido apenas quando gerado" e a única saída oferecida
 * era gerar outro — que invalida o link que a pessoa já tem e não vale para
 * ninguém até o arquivo ser publicado de novo. Um ciclo que quebrava a equipe
 * inteira a cada atualização de página.
 *
 * Aqui os links ficam gravados no navegador do gestor, e só nele. Nada disso
 * vai para o arquivo publicado, nada disso sai deste aparelho.
 *
 * NADA ENTRA SEM CONFERÊNCIA. Um link só é gravado depois de bater com o
 * resumo do cadastro: se não bate, ele não funcionaria para o destinatário, e
 * guardá-lo seria guardar uma promessa falsa.
 */
import { sha256Hex, normalizeToken } from './identity.js';

const CHAVE = 'liga.links';

function ler() {
  try {
    const cru = globalThis.localStorage?.getItem(CHAVE);
    const json = cru ? JSON.parse(cru) : null;
    return json && typeof json === 'object' ? json : {};
  } catch {
    return {};
  }
}

function gravar(mapa) {
  try {
    globalThis.localStorage?.setItem(CHAVE, JSON.stringify(mapa));
  } catch { /* armazenamento cheio ou bloqueado: a tela segue sem os links */ }
}

/** Todos os links guardados, por vendedor. */
export function linksGuardados() {
  return ler();
}

/** O link guardado de uma pessoa, ou null. */
export function linkDe(sellerId) {
  return ler()[sellerId] ?? null;
}

/** Esquece um link — usado quando o acesso é removido ou regerado. */
export function esquecerLink(sellerId) {
  const mapa = ler();
  if (!(sellerId in mapa)) return;
  delete mapa[sellerId];
  gravar(mapa);
}

/**
 * Guarda um link depois de conferir que ele abre a porta que promete.
 *
 * @returns {Promise<boolean>} false quando o código não bate com o cadastro
 */
export async function guardarLink(sellerId, token, roster) {
  const limpo = normalizeToken(token);
  if (!sellerId || !limpo) return false;
  const pessoa = (roster?.sellers ?? []).find((s) => s.sellerId === sellerId);
  if (!pessoa?.tokenHash) return false;
  if (await sha256Hex(limpo) !== pessoa.tokenHash) return false;

  const mapa = ler();
  mapa[sellerId] = limpo;
  gravar(mapa);
  return true;
}

/**
 * Lê códigos de um texto colado e guarda os que conferem.
 *
 * Aceita o que o gestor tiver em mãos: a lista que recebeu, uma planilha
 * copiada, mensagens de WhatsApp emendadas. O que importa é encontrar códigos
 * no formato XXXX-XXXX-XXXX e descobrir de quem é cada um — e quem descobre é
 * o cadastro, testando o resumo, não o texto ao lado.
 *
 * @returns {Promise<{guardados: string[], desconhecidos: string[]}>}
 */
export async function importarLinks(texto, roster) {
  const achados = String(texto ?? '').toUpperCase().match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4})+/g) ?? [];
  const guardados = [];
  const desconhecidos = [];

  for (const codigo of [...new Set(achados)]) {
    // eslint-disable-next-line no-await-in-loop
    const hash = await sha256Hex(codigo);
    const dono = (roster?.sellers ?? []).find((s) => s.tokenHash === hash);
    if (dono) {
      // eslint-disable-next-line no-await-in-loop
      if (await guardarLink(dono.sellerId, codigo, roster)) guardados.push(dono.name ?? dono.sellerId);
    } else if (hash !== roster?.manager?.tokenHash) {
      // O código do gestor não é "desconhecido": ele é apenas outra coisa, e
      // não tem lugar na lista de links de vendedor.
      desconhecidos.push(codigo);
    }
  }
  return { guardados, desconhecidos };
}
