/**
 * SIMULAÇÃO DE PRODUÇÃO
 * =====================
 *
 * Gera um período inteiro de produção fictícia em `config/simulacao/`, no mesmo
 * formato que o coletor grava em `config/producao/`. Serve para ver o
 * aplicativo funcionando por dentro — régua pessoal, desafio, barra coletiva,
 * ranking — sem depender do sistema de pedidos da direção.
 *
 * POR QUE UMA PASTA SEPARADA. A produção real é registro: ela não se mistura
 * com número inventado, nem por engano nem por comodidade. São duas pastas,
 * dois endereços e dois sites publicados; o que vem daqui carrega
 * `simulacao: true` no arquivo e o aplicativo mostra a tarja de dados
 * fictícios em cima de toda tela, sem que ninguém precise lembrar de avisar.
 *
 * O QUE ELA IMITA, e o que não imita:
 *   - imita a origem real: PEDIDOS por vendedor e FATURAMENTO só no total da
 *     equipe. É o que o sistema da direção entrega, e é o que o aplicativo tem
 *     de saber mostrar;
 *   - imita a curva do dia: leitura de dez em dez minutos, acumulada, com o
 *     intervalo do almoço parado, como o coletor grava;
 *   - imita a diferença entre pessoas e entre dias da semana, porque é disso
 *     que a régua pessoal vive: sem variação, toda média bateria exata e a
 *     tela não diria nada.
 *
 * Cada número sai de uma semente fixa (vendedor + data): rodar duas vezes dá
 * exatamente o mesmo mês. Simulação que muda a cada execução não serve para
 * conferir tela nenhuma.
 *
 * Executar:
 *   node scripts/simular-producao.mjs 2026-08-01 2026-09-12
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { historicoNaPasta, reguasDo } from './coletar-producao.mjs';
import { indexTeam } from '../src/core/team.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(raiz, 'config', 'simulacao');

/** Valor médio do pedido, calibrado pela produção real de 04/09. */
const TICKET = 17583;

/** A semana comercial não é plana, e a régua por dia da semana existe por isso. */
const PESO_DO_DIA = Object.freeze({
  1: 0.86, 2: 1.06, 3: 1.12, 4: 1.04, 5: 0.98, 6: 0.92,
});

/** Setembro um pouco melhor que agosto — para a comparação entre meses ter o que comparar. */
const PESO_DO_MES = Object.freeze({ '2026-08': 1.0, '2026-09': 1.10 });

/** Ruído determinístico: mesma semente, mesmo dia, sempre. */
function semente(texto) {
  let h = 2166136261;
  for (const c of String(texto)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>>= 0) % 100000) / 100000;
  };
}

/**
 * O "nível" de cada vendedor — estável ao longo dos meses.
 *
 * A distribuição imita a real de 04/09 (22, 18, 16, 15, 13, 12, 12, 11, 11, 10,
 * 10, 6, 6, 5, 4, 2, 2, 1, 1 e três zerados): alguns puxam a equipe, a maioria
 * fica no meio, alguns quase não aparecem. Achatar isso apagaria justamente o
 * que a régua pessoal serve para enxergar — quem melhorou em relação a si.
 */
function nivelDe(sellerId) {
  const r = semente(`nivel|${sellerId}`);
  const u = r();
  // Cauda longa: poucos muito acima, muitos no meio.
  return 1.6 + 17 * u ** 1.8;
}

export function pedidosDoDia(sellerId, data) {
  const r = semente(`${sellerId}|${data}`);
  const semanaDia = new Date(`${data}T00:00:00Z`).getUTCDay();
  const peso = PESO_DO_DIA[semanaDia] ?? 0;
  if (!peso) return 0;
  const mes = PESO_DO_MES[data.slice(0, 7)] ?? 1;
  // Ruído multiplicativo largo: o mesmo vendedor faz 6 numa terça e 13 na
  // seguinte, e é essa distância que a média móvel serve para resumir.
  const ruido = 0.65 + 0.75 * r();
  const bruto = nivelDe(sellerId) * peso * mes * ruido;
  // Um dia em cada doze a pessoa não abre o placar — férias, folga, visita.
  if (r() < 0.08) return 0;
  return Math.max(0, Math.round(bruto));
}

/** Minutos das leituras: de dez em dez, como o coletor grava. */
function leiturasDoDia(ate) {
  const marcas = [];
  for (let m = 8 * 60 + 10; m <= ate; m += 10) marcas.push(m);
  return marcas;
}

/**
 * A que horas cada pedido entra.
 *
 * A curva do dia não é reta: a manhã rende menos que a tarde, e no intervalo do
 * almoço o placar fica parado. Distribuir os pedidos por igual daria uma linha
 * reta em todos os gráficos e uma projeção sempre certa — bonito e falso.
 */
function horariosDosPedidos(quantos, sellerId, data, ate) {
  const r = semente(`hora|${sellerId}|${data}`);
  const inicio = 8 * 60 + 10;
  const almoco = [12 * 60, 13 * 60];
  const horas = [];
  for (let i = 0; i < quantos; i += 1) {
    // Expoente < 1 empurra a massa para a tarde.
    const u = r() ** 0.78;
    let m = inicio + u * (18 * 60 - inicio);
    if (m >= almoco[0] && m < almoco[1]) m = almoco[1] + (m - almoco[0]) * 0.2;
    if (m <= ate) horas.push(Math.round(m));
  }
  return horas.sort((a, b) => a - b);
}

function hhmm(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Todos os dias do período que têm expediente na simulação (segunda a sábado). */
export function diasDoPeriodo(de, ate) {
  const out = [];
  const cursor = new Date(`${de}T00:00:00Z`);
  const fim = new Date(`${ate}T00:00:00Z`);
  while (cursor <= fim) {
    const iso = cursor.toISOString().slice(0, 10);
    if (cursor.getUTCDay() >= 1) out.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** O arquivo de um dia, no formato que o aplicativo já sabe ler. */
export function diaSimulado(data, vendedores, { ate = 18 * 60 } = {}) {
  const marcas = leiturasDoDia(ate);
  const records = [];
  const porMarca = new Map(marcas.map((m) => [m, { orders: 0, revenue: 0 }]));
  const rValor = semente(`valor|${data}`);

  for (const pessoa of vendedores) {
    const total = pedidosDoDia(pessoa.sellerId, data);
    if (!total) continue;
    const horas = horariosDosPedidos(total, pessoa.sellerId, data, ate);
    if (!horas.length) continue;

    // Faturamento existe só no total da equipe — a origem real não reparte por
    // vendedor, e inventar aqui ensinaria a tela a mostrar o que ela não terá.
    const valores = horas.map(() => Math.round(TICKET * (0.25 + 2.6 * rValor() ** 1.7)));

    let anterior = null;
    for (const m of marcas) {
      const ate_m = horas.filter((h) => h <= m).length;
      if (ate_m !== anterior) {
        records.push({
          sellerId: pessoa.sellerId,
          sellerName: pessoa.nomeOriginal ?? pessoa.name,
          date: data,
          time: hhmm(m),
          orders: ate_m,
          revenue: 0,
        });
        anterior = ate_m;
      }
    }
    horas.forEach((h, i) => {
      for (const m of marcas) {
        if (m >= h) { porMarca.get(m).orders += 1; porMarca.get(m).revenue += valores[i]; break; }
      }
    });
  }

  // Acumula a linha da equipe e só marca vértice quando o número muda.
  const equipe = [];
  let orders = 0;
  let revenue = 0;
  for (const m of marcas) {
    const passo = porMarca.get(m);
    orders += passo.orders;
    revenue += passo.revenue;
    const ultimo = equipe.at(-1);
    if (!orders) continue;
    if (ultimo && ultimo.orders === orders && ultimo.revenue === revenue) continue;
    equipe.push({ time: hhmm(m), orders, revenue: Math.round(revenue * 100) / 100 });
  }

  return {
    _leia_me: 'SIMULAÇÃO. Números fictícios, gerados por scripts/simular-producao.mjs. Não é a produção real da equipe.',
    simulacao: true,
    data,
    publicadoEm: `${data}T21:05:00.000Z`,
    semantics: 'cumulative',
    faturamentoPorVendedor: false,
    equipe,
    records: records.sort((a, b) => (a.sellerId === b.sellerId
      ? a.time.localeCompare(b.time)
      : a.sellerId.localeCompare(b.sellerId))),
  };
}

function principal() {
  const [de, ate, horaLimite] = process.argv.slice(2);
  if (!de || !ate) {
    console.error('uso: node scripts/simular-producao.mjs AAAA-MM-DD AAAA-MM-DD [HH:MM do último dia]');
    process.exit(1);
  }
  const team = JSON.parse(readFileSync(join(raiz, 'config', 'vendedores.json'), 'utf8'));
  const index = indexTeam(team);
  const businessHours = JSON.parse(readFileSync(join(raiz, 'config', 'app.config.json'), 'utf8')).businessHours;

  rmSync(PASTA, { recursive: true, force: true });
  mkdirSync(PASTA, { recursive: true });

  const dias = diasDoPeriodo(de, ate);
  const corte = horaLimite
    ? Number(horaLimite.slice(0, 2)) * 60 + Number(horaLimite.slice(3, 5))
    : 18 * 60;

  for (const data of dias) {
    const ultimo = data === dias.at(-1);
    const dia = diaSimulado(data, team.vendedores, { ate: ultimo ? Math.min(corte, 18 * 60) : 18 * 60 });
    writeFileSync(join(PASTA, `${data}.json`), `${JSON.stringify(dia, null, 2)}\n`, 'utf8');
  }

  // Segunda passagem: cada dia recebe a régua calculada só com o que veio ANTES
  // dele. É a mesma função do coletor — a simulação não tem régua própria, ou
  // não estaria simulando nada.
  for (const data of dias) {
    const arquivo = join(PASTA, `${data}.json`);
    const dia = JSON.parse(readFileSync(arquivo, 'utf8'));
    const historico = historicoNaPasta(PASTA, data, index);
    dia.reguas = reguasDo({ data, historico }, dia.records, index, businessHours);
    writeFileSync(arquivo, `${JSON.stringify(dia, null, 2)}\n`, 'utf8');
  }

  // O mundo simulado trabalha de segunda a sábado; o aplicativo precisa saber
  // disso, ou trataria o sábado como dia sem expediente e não teria "hoje".
  writeFileSync(join(PASTA, 'app.config.overlay.json'), `${JSON.stringify({
    _leia_me: 'Sobreposição aplicada ao publicar o site de simulação.',
    businessHours: { workdays: [1, 2, 3, 4, 5, 6] },
  }, null, 2)}\n`, 'utf8');

  const ultimo = JSON.parse(readFileSync(join(PASTA, `${dias.at(-1)}.json`), 'utf8'));
  const totais = resumoPorMes(dias);
  console.log(`${dias.length} dias simulados em config/simulacao/ (${dias[0]} a ${dias.at(-1)})`);
  for (const [mes, t] of totais) {
    console.log(`  ${mes}: ${t.dias} dias, ${t.orders} pedidos, ${t.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`);
  }
  console.log(`  réguas no último dia: ${Object.keys(ultimo.reguas).length}`);
}

export function resumoPorMes(dias) {
  const meses = new Map();
  for (const data of dias) {
    const dia = JSON.parse(readFileSync(join(PASTA, `${data}.json`), 'utf8'));
    const fecho = dia.equipe.at(-1) ?? { orders: 0, revenue: 0 };
    const mes = data.slice(0, 7);
    const atual = meses.get(mes) ?? { dias: 0, orders: 0, revenue: 0 };
    atual.dias += 1;
    atual.orders += fecho.orders;
    atual.revenue += fecho.revenue;
    meses.set(mes, atual);
  }
  return meses;
}

if (process.argv[1] && process.argv[1].endsWith('simular-producao.mjs')) principal();
