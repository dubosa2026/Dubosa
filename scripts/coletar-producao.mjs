/**
 * COLETOR DA PRODUÇÃO
 * ===================
 *
 * Roda no GitHub Actions, de tempo em tempo. Entra no sistema de pedidos com o
 * PIN, lê os números e grava `config/producao/AAAA-MM-DD.json` no repositório.
 * O aplicativo já sabe ler esse arquivo — é a mesma fonte que o gestor usava ao
 * publicar o dia à mão.
 *
 * Por que assim, e não com um servidor:
 *   - não custa nada e não exige conta nova: o GitHub que já existe basta;
 *   - o PIN fica nos segredos do repositório, nunca no código;
 *   - a coleta acontece UMA vez a cada rodada, não uma vez por vendedor. Vinte
 *     e dois aplicativos abertos o dia inteiro não geram nenhuma chamada extra:
 *     todos leem o mesmo arquivo pronto.
 *
 * O QUE ISTO EXPÕE, dito com todas as letras: o arquivo do dia fica dentro do
 * repositório. Se o repositório for público, quem souber o endereço lê os
 * nomes e as quantidades. A privacidade que o aplicativo garante — um vendedor
 * não ver o outro — continua valendo dentro dele; esta é outra coisa. Para o
 * número não sair da empresa, a leitura precisa acontecer atrás de um servidor
 * (ver docs/INTEGRACAO-DADOS.md).
 *
 * Variáveis de ambiente:
 *   PEDIDOS_BASE  endereço do sistema de pedidos
 *   PEDIDOS_PIN   o PIN de acesso  (nos Secrets do repositório)
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugifyName } from '../src/data/types.js';
import { buildDayState, mergeTeam } from '../src/data/store.js';
import { indexTeam, resolveSeller } from '../src/core/team.js';
import { reguaDe } from '../src/core/regua.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.PEDIDOS_BASE ?? 'https://pedidos-belenergy-tega.netlify.app').replace(/\/$/, '');
const PIN = process.env.PEDIDOS_PIN;
const TZ = 'America/Sao_Paulo';

/** Data e hora de agora no fuso de São Paulo. */
export function agoraEmSaoPaulo(quando = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(quando).map((p) => [p.type, p.value]));
  const hora = partes.hour === '24' ? '00' : partes.hour;
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: `${hora}:${partes.minute}` };
}

/** '02/09/2026' -> '2026-09-02' */
export function dataISO(texto) {
  const m = String(texto ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function entrar() {
  if (!PIN) throw new Error('PEDIDOS_PIN não configurado nos Secrets do repositório.');
  const res = await fetch(`${BASE}/api/entrar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: PIN }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'PIN recusado pelo sistema de pedidos.' : `Entrada recusada (${res.status}).`);
  }
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')].filter(Boolean);
  if (!cookies.length) throw new Error('O sistema de pedidos não devolveu cookie de sessão.');
  return cookies.map((c) => String(c).split(';')[0]).join('; ');
}

async function lerDados(cookie) {
  const res = await fetch(`${BASE}/api/dados`, { headers: { cookie, accept: 'application/json' } });
  if (!res.ok) throw new Error(`O sistema de pedidos respondeu ${res.status}.`);
  return res.json();
}

/**
 * Monta os registros da leitura atual.
 *
 * O sistema de pedidos dá QUANTIDADE por vendedor e faturamento só por
 * carteira, então `revenue` fica em zero e o arquivo declara isso: o aplicativo
 * lê a declaração e passa a ranquear por pedidos, em vez de mostrar R$ 0 como
 * se ninguém tivesse vendido.
 */
export function registrosDe(D, { data, hora }) {
  return (D?.vendedores ?? [])
    .map((v) => {
      const nome = String(v[1] ?? '').trim();
      return {
        sellerId: slugifyName(nome),
        sellerName: nome,
        date: data,
        time: hora,
        orders: Number(v[2]) || 0,
        revenue: 0,
      };
    })
    .filter((r) => r.sellerName);
}

/**
 * Total da carteira na leitura atual — pedidos E faturamento.
 *
 * Este é o faturamento que a origem realmente informa. Ele não se reparte
 * entre vendedores (a lista por vendedor traz só quantidade), mas jogá-lo fora
 * também estava errado: é o resultado do dia da equipe, e o painel ficava com
 * a linha de faturamento vazia tendo o número à mão.
 */
export function totaisDe(D, { hora }) {
  const carteiras = Array.isArray(D?.carteiras) ? D.carteiras : [];
  const somaCarteiras = carteiras.reduce((acc, c) => ({
    orders: acc.orders + (Number(c?.[1]) || 0),
    revenue: acc.revenue + (Number(c?.[2]) || 0),
  }), { orders: 0, revenue: 0 });

  const orders = Number(D?.hoje) || somaCarteiras.orders;
  const revenue = Number(D?.valorDia) || somaCarteiras.revenue;
  if (!orders && !revenue) return null;
  return { time: hora, orders, revenue };
}

/** Mesma regra de acúmulo dos vendedores, aplicada à linha da equipe. */
export function acumularTotais(anteriores, novo) {
  if (!novo) return anteriores;
  if (anteriores.some((t) => t.time === novo.time)) return anteriores;
  const ultimo = anteriores.at(-1);
  if (ultimo && ultimo.orders === novo.orders && ultimo.revenue === novo.revenue) return anteriores;
  return [...anteriores, novo].sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Junta a leitura nova ao que já foi gravado hoje, formando a curva do dia.
 * Cada par (vendedor, horário) entra uma vez; leitura igual à anterior não
 * gera ponto novo — a curva só ganha vértice quando a produção muda.
 */
export function acumular(anteriores, novos) {
  const vistos = new Set(anteriores.map((r) => `${r.sellerId}|${r.time}`));
  const ultimo = new Map();
  for (const r of anteriores) {
    const antes = ultimo.get(r.sellerId);
    if (!antes || r.time > antes.time) ultimo.set(r.sellerId, r);
  }

  const saida = [...anteriores];
  for (const novo of novos) {
    if (vistos.has(`${novo.sellerId}|${novo.time}`)) continue;
    const antes = ultimo.get(novo.sellerId);
    if (antes && antes.orders === novo.orders && antes.revenue === novo.revenue) continue;
    saida.push(novo);
    ultimo.set(novo.sellerId, novo);
  }
  return saida.sort((a, b) => (a.sellerId === b.sellerId
    ? a.time.localeCompare(b.time)
    : a.sellerId.localeCompare(b.sellerId)));
}

/**
 * A RÉGUA PESSOAL, CALCULADA AQUI — E NÃO NO NAVEGADOR
 * ===================================================
 *
 * A régua de cada pessoa é a média do que ela mesma fez em dias anteriores. Uma
 * média de quinta-feira precisa de várias quintas: quatro semanas de histórico
 * para valer alguma coisa.
 *
 * O navegador do vendedor não tem como buscar isso. Cada dia é um arquivo, e
 * carregar vinte arquivos a cada atualização de tela, vezes vinte e dois
 * aplicativos abertos o dia inteiro, é tráfego demais para o lugar de onde eles
 * vêm — sem contar que a comparação continuaria pobre nas primeiras semanas.
 *
 * Aqui, ao contrário, o histórico inteiro está no disco: esta coleta roda
 * DENTRO do repositório. Então a régua é calculada uma vez, no mesmo lugar onde
 * já se grava o dia, e viaja pronta dentro do arquivo. O aplicativo continua
 * sabendo calculá-la sozinho — é a mesma função — e usa esse caminho quando o
 * arquivo não traz a régua pronta.
 *
 * A IDENTIDADE É RESOLVIDA PELO CADASTRO, não pelo texto do nome. É o cadastro
 * que decide quem é quem no aplicativo; uma régua guardada sob o nome cru da
 * origem não encontraria o dono do outro lado.
 */
export function historicoNaPasta(pasta, ate, index, limite = 40) {
  if (!existsSync(pasta)) return [];
  const dias = [];
  const arquivos = readdirSync(pasta)
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort()
    .reverse();

  for (const nome of arquivos) {
    if (dias.length >= limite) break;
    const data = nome.slice(0, 10);
    if (data >= ate) continue;
    try {
      const json = JSON.parse(readFileSync(join(pasta, nome), 'utf8'));
      const registros = json.records ?? json.registros ?? [];
      if (!registros.length) continue;
      const estado = buildDayState({
        status: 'ready',
        date: data,
        semantics: json.semantics ?? 'cumulative',
        records: registros.map((r) => ({ ...r, date: data })),
      });
      dias.push(index ? mergeTeam(estado, index, resolveSeller) : estado);
    } catch {
      // Um arquivo ilegível não pode derrubar a coleta do dia: a régua daquele
      // dia simplesmente não entra na média.
    }
  }
  return dias;
}

/** Arredonda a curva: centavos de pedido médio não informam nada e pesam. */
function enxugar(regua) {
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    base: regua.base,
    amostras: regua.amostras,
    desde: regua.desde,
    nomeDoDia: regua.nomeDoDia,
    pontos: regua.pontos.map((p) => ({ m: p.m, orders: r2(p.orders), revenue: r2(p.revenue) })),
    fechamento: { orders: r2(regua.fechamento.orders), revenue: r2(regua.fechamento.revenue) },
  };
}

export function reguasDo(dia, registros, index, businessHours) {
  const dias = dia.historico;
  const ids = new Set();
  for (const r of registros) {
    ids.add(index ? resolveSeller(r.sellerName, index).sellerId : r.sellerId);
  }
  // Quem está no cadastro e ainda não produziu hoje também tem régua: é
  // justamente quem mais precisa saber qual é a própria marca.
  for (const id of index?.byId?.keys() ?? []) ids.add(id);

  const saida = {};
  for (const sellerId of ids) {
    const regua = reguaDe({ sellerId, hoje: dia.data, dias, businessHours });
    if (regua.amostras) saida[sellerId] = enxugar(regua);
  }
  return saida;
}

function cadastro() {
  const arquivo = join(raiz, 'config', 'vendedores.json');
  if (!existsSync(arquivo)) return null;
  try {
    return indexTeam(JSON.parse(readFileSync(arquivo, 'utf8')));
  } catch {
    return null;
  }
}

function horarioComercial() {
  try {
    return JSON.parse(readFileSync(join(raiz, 'config', 'app.config.json'), 'utf8')).businessHours ?? null;
  } catch {
    return null;
  }
}

async function principal() {
  const { data, hora } = agoraEmSaoPaulo();
  const cookie = await entrar();
  const D = await lerDados(cookie);

  // O sistema pode estar servindo um dia anterior ao nosso relógio (leitura da
  // madrugada, por exemplo). Vale a data que ele próprio declara.
  const dataDoSistema = dataISO(D?.data) ?? data;
  const novos = registrosDe(D, { data: dataDoSistema, hora });

  if (!novos.length) {
    console.log('Nenhum vendedor na resposta. Nada a gravar.');
    return;
  }

  const pasta = join(raiz, 'config', 'producao');
  const arquivo = join(pasta, `${dataDoSistema}.json`);
  mkdirSync(pasta, { recursive: true });

  let anteriores = [];
  let totaisAnteriores = [];
  if (existsSync(arquivo)) {
    try {
      const lido = JSON.parse(readFileSync(arquivo, 'utf8'));
      anteriores = lido.records ?? [];
      totaisAnteriores = lido.equipe ?? [];
    } catch { anteriores = []; totaisAnteriores = []; }
  }

  const registros = acumular(anteriores, novos);
  const totais = acumularTotais(totaisAnteriores, totaisDe(D, { hora }));
  if (registros.length === anteriores.length && totais.length === totaisAnteriores.length) {
    console.log(`Nada mudou desde a última leitura (${anteriores.length} registros). Arquivo intacto.`);
    return;
  }

  const index = cadastro();
  const businessHours = horarioComercial();
  const historico = historicoNaPasta(pasta, dataDoSistema, index);
  const reguas = reguasDo({ data: dataDoSistema, historico }, registros, index, businessHours);

  writeFileSync(arquivo, `${JSON.stringify({
    _leia_me: 'Coletado automaticamente do sistema de pedidos. Não editar à mão.',
    data: dataDoSistema,
    publicadoEm: new Date().toISOString(),
    semantics: 'cumulative',
    faturamentoPorVendedor: false,
    origem: { ultimaNota: D?.ultimaNota ?? null, geradoEm: D?.geradoEm ?? null },
    // Total da carteira ao longo do dia. É faturamento de verdade; só não se
    // reparte entre vendedores.
    equipe: totais,
    // A régua de cada pessoa, calculada do histórico que está no disco. Sem
    // isto, o navegador só conseguiria comparar com os poucos dias que carrega.
    reguas,
    records: registros,
  }, null, 2)}\n`, 'utf8');

  console.log(`${arquivo}: ${registros.length} registros (${registros.length - anteriores.length} novos), leitura das ${hora}.`);
  console.log(`  ${Object.keys(reguas).length} régua(s) pessoal(is) sobre ${historico.length} dia(s) de histórico.`);
}

if (process.argv[1] && process.argv[1].endsWith('coletar-producao.mjs')) {
  principal().catch((err) => {
    console.error(`Falhou: ${err.message}`);
    process.exit(1);
  });
}
