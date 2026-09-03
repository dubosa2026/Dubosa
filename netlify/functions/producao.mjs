/**
 * PRODUÇÃO DO DIA — função de servidor
 * ====================================
 *
 * É esta função que torna a privacidade real em vez de apenas visual.
 *
 * Sem ela, o dia inteiro precisa chegar ao navegador do vendedor para que a
 * posição exista; o painel não mostra nada de terceiro, mas os bytes
 * trafegaram. Com ela, o ranking é calculado AQUI e o vendedor recebe só os
 * próprios números mais a posição e as distâncias, sem nome e sem valor de
 * ninguém.
 *
 * Também é aqui que a senha do sistema de pedidos deve morar — em variável de
 * ambiente, nunca no repositório.
 *
 * VARIÁVEIS DE AMBIENTE (Site settings → Environment variables)
 *   PEDIDOS_URL    endereço dos dados no sistema de pedidos.
 *                  Aceita {data} e {dataBR}.
 *   PEDIDOS_SENHA  a senha, se houver.
 *   PEDIDOS_AUTH   'query' | 'header' | 'body' | 'none'   (padrão: 'query')
 *   PEDIDOS_CAMPO  nome do campo da senha                 (padrão: 'senha')
 *   PEDIDOS_LISTA  caminho até a lista na resposta        (opcional)
 *
 * CHAMADA
 *   GET /.netlify/functions/producao?data=2026-09-03&token=XXXX-XXXX-XXXX
 *
 * A lógica de ranking é importada de `src/core/` — a mesma que o aplicativo
 * usa e que os testes cobrem. Nada é reimplementado aqui.
 */

import { rankAt, gapsFor } from '../../src/core/ranking.js';
import { buildDayState, mergeTeam } from '../../src/data/store.js';
import { slugifyName } from '../../src/data/types.js';
import { indexTeam, resolveSeller } from '../../src/core/team.js';
import { toMinutes } from '../../src/core/clock.js';
import { extractCollection } from '../../src/data/sources/HttpJsonSource.js';

const SITE = process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? '';

/** SHA-256 em hexadecimal, com a API de criptografia do runtime. */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function lerJson(caminho) {
  const res = await fetch(`${SITE}/${caminho}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Não consegui ler ${caminho} (${res.status}).`);
  return res.json();
}

/** Quem está chamando? Devolve null quando o código não é reconhecido. */
async function identificar(token, roster) {
  if (!token) return null;
  const hash = await sha256Hex(String(token).trim().toUpperCase());
  if (roster.manager?.tokenHash === hash) return { role: 'manager', sellerId: null };
  const seller = (roster.sellers ?? []).find((s) => s.tokenHash === hash);
  return seller ? { role: 'seller', sellerId: seller.sellerId } : null;
}

/**
 * LEITURA DO SISTEMA DE PEDIDOS
 * =============================
 *
 * Descoberto a partir do código-fonte da própria página (03/09/2026):
 *
 *   POST /api/entrar  {pin}   -> devolve um cookie de sessão
 *   GET  /api/dados            -> os números, no escopo daquele PIN
 *
 * O PIN de um gestor faz o servidor recortar a resposta na carteira dele —
 * então a Liga recebe exatamente a equipe do Eduardo, sem filtro nosso.
 *
 * FORMA DA RESPOSTA, e o limite que ela impõe:
 *
 *   D.vendedores  [ [gerente, vendedor, QUANTIDADE], ... ]
 *   D.carteiras   [ [gerente, quantidade, VALOR], ... ]
 *
 * O faturamento existe por CARTEIRA, não por vendedor. Conferido nos três
 * pontos em que a página lê `D.vendedores`: ela nunca toca num quarto campo.
 *
 * Consequência assumida: o ranking individual da Liga é por PEDIDOS. Repartir
 * o faturamento da carteira entre os vendedores daria um número plausível e
 * falso — e um ranking construído sobre número inventado é pior que um ranking
 * por pedidos, que é verdade inteira.
 *
 * VARIÁVEIS DE AMBIENTE
 *   PEDIDOS_BASE  https://pedidos-belenergy-tega.netlify.app
 *   PEDIDOS_PIN   o PIN de acesso
 */

const BASE = (process.env.PEDIDOS_BASE ?? 'https://pedidos-belenergy-tega.netlify.app').replace(/\/$/, '');

/** Entra com o PIN e devolve o cookie de sessão. */
async function entrar() {
  const pin = process.env.PEDIDOS_PIN;
  if (!pin) throw new Error('PEDIDOS_PIN não configurada nas variáveis de ambiente.');

  const res = await fetch(`${BASE}/api/entrar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'PIN recusado pelo sistema de pedidos.' : `Entrada recusada (${res.status}).`);
  }

  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')].filter(Boolean);
  if (!cookies.length) throw new Error('O sistema de pedidos não devolveu cookie de sessão.');
  return cookies.map((c) => String(c).split(';')[0]).join('; ');
}

async function lerDados(cookie) {
  const res = await fetch(`${BASE}/api/dados`, {
    headers: { cookie, accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('A sessão do sistema de pedidos expirou.');
  if (res.status === 404) throw new Error('Nenhuma leitura chegou ainda hoje no sistema de pedidos.');
  if (!res.ok) throw new Error(`O sistema de pedidos respondeu ${res.status}.`);
  return res.json();
}

/** '02/09/2026' -> '2026-09-02' */
function dataISO(texto) {
  const m = String(texto ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** 'ISO' -> 'HH:mm' no fuso de São Paulo. */
function horaDe(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/**
 * Converte a resposta do sistema de pedidos nos registros canônicos da Liga.
 *
 * `revenue` fica em 0 de propósito, e a Liga sabe disso: quando nenhum vendedor
 * tem faturamento, ela ranqueia por pedidos e mostra "não informado" em vez de
 * "R$ 0" — que seria afirmar que ninguém vendeu nada.
 */
function registrosDoDia(D, date, horaPedida) {
  const hoje = dataISO(D?.data) ?? date;
  const ontem = dataISO(D?.ontemData);

  if (date === hoje) {
    const hora = horaPedida ?? horaDe(D?.geradoEm) ?? '23:59';
    return (D?.vendedores ?? []).map((v) => {
      const nome = String(v[1] ?? '').trim();
      return {
        // Sem id próprio, `buildDayState` agrupa por `sellerId` e a equipe
        // inteira cai num balde só — foi o que os testes pegaram.
        sellerId: slugifyName(nome),
        sellerName: nome,
        date,
        time: hora,
        orders: Number(v[2]) || 0,
        revenue: 0,
      };
    }).filter((r) => r.sellerName);
  }

  // O dia anterior vem fechado, até a meia-noite: é o número certo para a
  // comparação "como ontem terminou".
  if (ontem && date === ontem) {
    return (D?.vendedoresOntemFechado ?? []).map((v) => {
      const nome = String(v[1] ?? '').trim();
      return {
        sellerId: slugifyName(nome),
        sellerName: nome,
        date,
        time: '23:59',
        orders: Number(v[2]) || 0,
        revenue: 0,
      };
    }).filter((r) => r.sellerName);
  }

  return [];
}

/** Busca a produção de um dia. */
async function buscarProducao(date, horaDaLeitura) {
  const cookie = await entrar();
  const D = await lerDados(cookie);
  return {
    registros: registrosDoDia(D, date, horaDaLeitura),
    origem: {
      data: D?.data ?? null,
      geradoEm: D?.geradoEm ?? null,
      ultimaNota: D?.ultimaNota ?? null,
      gestor: D?.gestor ?? null,
      totalCarteira: D?.hoje ?? null,
      valorCarteira: D?.valorDia ?? null,
      // A Liga informa, em toda resposta, que o faturamento individual não
      // existe na origem — para nenhuma tela precisar adivinhar isso.
      faturamentoPorVendedor: false,
    },
  };
}

export default async (request) => {
  const url = new URL(request.url);
  const date = url.searchParams.get('data');
  const token = url.searchParams.get('token');
  const hora = url.searchParams.get('hora');

  const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // O aplicativo é servido de outro endereço (GitHub Pages, por exemplo).
      'Access-Control-Allow-Origin': process.env.ORIGEM_PERMITIDA ?? '*',
      'Cache-Control': 'no-store',
    },
  });

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ status: 'error', message: 'Parâmetro "data" ausente ou inválido.' }, 400);
  }

  let roster;
  let team;
  try {
    [roster, team] = await Promise.all([lerJson('config/equipe.json'), lerJson('config/vendedores.json')]);
  } catch (err) {
    return json({ status: 'error', message: err.message }, 500);
  }

  const quem = await identificar(token, roster);
  if (!quem) {
    // Código não reconhecido não recebe nada — nem a informação de que o dia existe.
    return json({ status: 'error', message: 'Código de acesso não reconhecido.' }, 403);
  }

  const horaValida = hora && /^\d{1,2}:\d{2}$/.test(hora) ? hora.padStart(5, '0') : null;

  let registros;
  let origem = {};
  try {
    const lido = await buscarProducao(date, horaValida);
    registros = lido.registros;
    origem = lido.origem;
  } catch (err) {
    return json({ status: 'error', message: err.message, records: [] }, 502);
  }

  // O cadastro da equipe entra aqui também: quem está zerado não vem do sistema
  // de pedidos e precisa existir para a posição fazer sentido.
  const dia = mergeTeam(
    buildDayState({ status: 'ready', records: registros, semantics: 'cumulative', date, meta: {} }),
    indexTeam(team),
    resolveSeller,
  );

  const minutos = horaValida ? toMinutes(horaValida) : 24 * 60;

  if (quem.role === 'manager') {
    return json({
      status: 'ready',
      records: registros,
      semantics: 'cumulative',
      date,
      fetchedAt: new Date().toISOString(),
      meta: { escopo: 'manager', total: registros.length, origem },
    });
  }

  // --- vendedor: o ranking é calculado AQUI e nada de terceiro sai daqui ----
  // Critério: pedidos. A origem não tem faturamento por vendedor, e ranquear
  // por um faturamento que não existe daria empate zerado para a equipe toda.
  const ranking = rankAt(dia, minutos, {
    primary: origem.faturamentoPorVendedor ? 'revenue' : 'orders',
    tiebreakers: origem.faturamentoPorVendedor
      ? ['orders', 'firstToReach', 'name']
      : ['revenue', 'firstToReach', 'name'],
    includeZeroProduction: true,
  });
  const gaps = gapsFor(ranking, quem.sellerId);
  const meus = registros.filter((r) => resolveSeller(r.sellerName, indexTeam(team)).sellerId === quem.sellerId);

  return json({
    status: 'ready',
    records: meus,
    semantics: 'cumulative',
    date,
    fetchedAt: new Date().toISOString(),
    competitive: gaps && {
      position: gaps.position,
      total: gaps.total,
      isLeader: gaps.isLeader,
      isLast: gaps.isLast,
      // Somente magnitudes. Nome, id e faturamento alheios não atravessam esta linha.
      toNext: gaps.toNext ? { revenue: gaps.toNext.revenue, orders: gaps.toNext.orders } : null,
      toPrevious: gaps.toPrevious ? { revenue: gaps.toPrevious.revenue, orders: gaps.toPrevious.orders } : null,
      toLeader: gaps.toLeader ? { revenue: gaps.toLeader.revenue, orders: gaps.toLeader.orders } : null,
    },
    team: {
      sellerCount: dia.sellers.length,
      activeCount: dia.sellers.filter((s) => s.revenue > 0 || s.orders > 0).length,
      orders: dia.sellers.reduce((sum, s) => sum + s.orders, 0),
      revenue: dia.sellers.reduce((sum, s) => sum + s.revenue, 0),
    },
    meta: { escopo: 'seller', origem },
  });
};

export const config = { path: '/api/producao' };
