export const ROLES = ["ADMIN", "GERENTE", "SUPERVISOR", "VENDEDOR"] as const;
export type Role = (typeof ROLES)[number];

export const TASK_STATUSES = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "ATRASADA"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["ALTA", "MEDIA", "BAIXA"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const ALERT_LEVELS = ["ATENCAO", "OPORTUNIDADE", "DESTAQUE", "INFORMACAO"] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export const HEALTH_STATUSES = ["SAUDAVEL", "ATENCAO", "RISCO", "ALTO_RISCO"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const CLIENT_CLASSES = ["A", "B", "C"] as const;
export type ClientClass = (typeof CLIENT_CLASSES)[number];

export const GOAL_SCOPES = ["VENDEDOR", "EQUIPE", "ESTADO", "REGIAO"] as const;
export const GOAL_PERIODS = ["DIARIA", "SEMANAL", "MENSAL"] as const;

// Regras de negócio configuráveis do Customer Health Score (seção 9 do
// briefing). Podem futuramente virar registros em `Setting`.
export const HEALTH_SCORE_RULES = {
  // multiplicador do intervalo médio de compra a partir do qual o cliente
  // já é considerado em risco por ausência de compra
  riscoMultiplicadorIntervalo: 1.5,
  altoRiscoMultiplicadorIntervalo: 2.5,
  quedaFaturamentoAtencao: 0.15, // 15%
  quedaFaturamentoRisco: 0.35,
};
