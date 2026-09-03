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
import { toRecords } from '../../src/data/types.js';
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
 * ÚNICO PONTO QUE DEPENDE DO SISTEMA DE PEDIDOS.
 *
 * Busca a produção bruta do dia. Ajuste apenas esta função quando souber o
 * formato exato da resposta — todo o resto já está pronto e testado.
 */
async function buscarProducao(date, horaDaLeitura) {
  const base = process.env.PEDIDOS_URL;
  if (!base) throw new Error('PEDIDOS_URL não configurada nas variáveis de ambiente.');

  const [y, m, d] = date.split('-');
  const url = new URL(base.replaceAll('{data}', date).replaceAll('{dataBR}', `${d}/${m}/${y}`));

  const modo = process.env.PEDIDOS_AUTH ?? 'query';
  const campo = process.env.PEDIDOS_CAMPO ?? 'senha';
  const senha = process.env.PEDIDOS_SENHA ?? '';
  const headers = { Accept: 'application/json' };
  let body;

  if (modo === 'query' && senha) url.searchParams.set(campo, senha);
  if (modo === 'header' && senha) headers[campo] = senha;
  if (modo === 'body' && senha) body = JSON.stringify({ [campo]: senha, data: date });

  const res = await fetch(url, { method: body ? 'POST' : 'GET', headers, body });
  if (!res.ok) throw new Error(`O sistema de pedidos respondeu ${res.status}.`);

  const json = await res.json();
  const linhas = extractCollection(json, process.env.PEDIDOS_LISTA ?? '');
  if (!linhas?.length) throw new Error('Não encontrei a lista de vendedores na resposta.');

  // O horário do registro é o instante que o chamador está avaliando, e só
  // cai para o relógio do servidor quando o chamador não informa. Carimbar
  // sempre com o relógio do servidor faria a leitura cair fora da janela
  // avaliada — e o ranking sairia zerado sem ninguém entender por quê.
  const agora = horaDaLeitura ?? new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const { records } = toRecords(linhas.map((linha) => ({ ...linha, __data: date, __hora: agora })), {
    fieldMap: {
      sellerId: ['sellerId', 'id', 'codigo'],
      sellerName: ['sellerName', 'nome', 'vendedor', 'vendedora', 'name', 'representante'],
      date: ['__data'],
      time: ['__hora'],
      orders: ['orders', 'pedidos', 'qtdPedidos', 'quantidade_pedidos', 'num_pedidos'],
      revenue: ['revenue', 'faturamento', 'valor', 'venda', 'vendas', 'total'],
    },
  });
  return records;
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
  try {
    registros = await buscarProducao(date, horaValida);
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
      meta: { escopo: 'manager', total: registros.length },
    });
  }

  // --- vendedor: o ranking é calculado AQUI e nada de terceiro sai daqui ----
  const ranking = rankAt(dia, minutos, {
    primary: 'revenue',
    tiebreakers: ['orders', 'firstToReach', 'name'],
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
    meta: { escopo: 'seller' },
  });
};

export const config = { path: '/api/producao' };
