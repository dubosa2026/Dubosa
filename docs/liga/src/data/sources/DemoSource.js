import { DataSource } from '../DataSource.js';
import { workWindows, nowInTimezone, toMinutes } from '../../core/clock.js';
import { slugifyName } from '../types.js';

/**
 * FONTE DE DEMONSTRAÇÃO — NÃO SÃO DADOS REAIS
 * ===========================================
 *
 * Existe por um único motivo: permitir que o gestor valide a interface, as
 * permissões e os cálculos ANTES de a base real ser definida.
 *
 * Salvaguardas obrigatórias:
 *   - desligada por padrão;
 *   - só pode ser ligada pelo gestor, na tela de configuração;
 *   - marca `isDemo: true` em toda resposta, o que obriga a interface a exibir
 *     a tarja permanente "DADOS DE DEMONSTRAÇÃO";
 *   - números gerados por semente fixa, iguais em qualquer máquina.
 *
 * Ela NÃO é a camada de importação e não deve ser usada como base para o
 * adaptador definitivo.
 */

const TEAM = [
  { name: 'João Pedro Alves', strength: 1.32, morning: 1.25 },
  { name: 'Mariana Costa', strength: 1.28, morning: 0.85 },
  { name: 'Rafael Nogueira', strength: 1.05, morning: 1.05 },
  { name: 'Beatriz Lima', strength: 0.98, morning: 1.15 },
  { name: 'Carlos Eduardo Reis', strength: 0.92, morning: 0.9 },
  { name: 'Patrícia Moraes', strength: 0.86, morning: 1.0 },
  { name: 'Diego Fontana', strength: 0.74, morning: 0.8 },
  { name: 'Luciana Prado', strength: 0.61, morning: 1.1 },
];

const SNAPSHOT_STEP_MINUTES = 15;

/** PRNG determinístico (mulberry32) — mesma semente, mesmos números, sempre. */
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class DemoSource extends DataSource {
  static id = 'demo';

  static label = 'Demonstração (dados fictícios)';

  constructor(options = {}) {
    super(options);
    this.businessHours = options.businessHours ?? { start: '08:00', end: '18:00', breaks: [] };
    this.timezone = options.timezone ?? 'America/Sao_Paulo';
    // Quando existe cadastro de equipe, a demonstração usa os nomes reais e
    // deixa parte do grupo ZERADA de propósito: é assim que o sistema de
    // pedidos da empresa se comporta — só lista quem já vendeu.
    this.team = (options.team ?? []).length
      ? options.team.map((p, i) => ({
        name: p.name,
        sellerId: p.sellerId,
        strength: 0.55 + ((i * 37) % 100) / 100,
        morning: 0.8 + ((i * 53) % 60) / 100,
      }))
      : TEAM.map((p) => ({ ...p, sellerId: slugifyName(p.name) }));
  }

  get semantics() {
    return 'cumulative';
  }

  get isConnected() {
    return true;
  }

  get isDemo() {
    return true;
  }

  async fetchDay(date, scope = { role: 'manager', sellerId: null, include: 'team' }) {
    const now = nowInTimezone(this.timezone);
    const cutoff = date === now.date ? now.minutes : Number.POSITIVE_INFINITY;
    const windows = workWindows(this.businessHours);
    const open = windows.length ? windows[0].start : toMinutes('08:00');

    const records = [];
    const roster = this.team;
    for (const person of roster) {
      const sellerId = person.sellerId ?? slugifyName(person.name);

      // Cerca de um terço da equipe fica fora da resposta, como acontece na
      // origem real: quem ainda não vendeu simplesmente não é listado.
      const silencioso = seedFrom(`${date}|silencio|${sellerId}`) % 4 === 0;
      if (silencioso) continue;
      // Escopo aplicado na fonte: quando o pedido é 'own', o vendedor não
      // recebe nem um byte do dado de outra pessoa.
      if (scope?.include === 'own' && scope.sellerId !== sellerId) continue;

      const rand = rng(seedFrom(`${date}|${sellerId}`));
      const dayFactor = 0.72 + rand() * 0.62;
      const avgTicket = 6200 + rand() * 4200;
      const targetOrders = Math.max(2, Math.round((9 + rand() * 9) * person.strength * dayFactor));

      let orders = 0;
      let revenue = 0;
      for (const w of windows) {
        for (let m = w.start; m <= w.end; m += SNAPSHOT_STEP_MINUTES) {
          if (m > cutoff) break;
          const progress = (m - open) / Math.max(1, windows.at(-1).end - open);
          // Curva intradiária: manhã e final de tarde mais fortes.
          const shape = person.morning * (1 - progress) + (2 - person.morning) * progress;
          const chance = (targetOrders / 36) * shape * 0.9;
          if (m > w.start && rand() < chance) {
            orders += 1;
            revenue += Math.round((avgTicket * (0.55 + rand() * 1.05)) / 100) * 100;
          }
          records.push({
            sellerId,
            sellerName: person.name,
            date,
            time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
            orders,
            revenue,
          });
        }
      }
    }

    return {
      status: 'ready',
      records,
      semantics: 'cumulative',
      date,
      fetchedAt: new Date().toISOString(),
      message: null,
      meta: { isDemo: true, sellers: roster.length },
    };
  }

  async fetchRoster(scope) {
    if (scope?.role !== 'manager') return [];
    return this.team.map((p) => ({ sellerId: p.sellerId ?? slugifyName(p.name), sellerName: p.name }));
  }

  async health() {
    return {
      ok: true,
      label: DemoSource.label,
      detail: 'Modo demonstração ativo. Os números na tela são fictícios e servem apenas para validar a interface.',
    };
  }
}
