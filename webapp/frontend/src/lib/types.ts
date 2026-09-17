export interface DashboardSummary {
  resultado: {
    faturamentoAtual: number;
    meta: number;
    percentualAtingido: number | null;
    gap: number;
    projecaoFimPeriodo: number;
    faturamentoPeriodoAnterior: number;
    variacaoPercentual: number | null;
  };
  pedidos: { total: number; mediaDiaria: number; ticketMedio: number; pedidosPeriodoAnterior: number };
  clientes: { ativos: number; novos: number; reativados: number; inativos: number; emRisco: number };
  equipe: { acimaDaMeta: number; abaixoDaMeta: number; tendenciaQueda: number; tendenciaCrescimento: number };
}

export interface VendorPerformance {
  vendorId: string;
  name: string;
  revenue: number;
  previousRevenue: number;
  variacaoPercentual: number | null;
  goal: number;
  pctGoal: number | null;
  orders: number;
  avgTicket: number;
  previousAvgTicket: number;
  ticketVariacaoPercentual: number | null;
  trend: "CRESCIMENTO" | "QUEDA" | "ESTAVEL";
  clientesEmRisco?: number;
}

export interface DashboardResponse {
  greetingName: string;
  summary: DashboardSummary;
  vendedores: VendorPerformance[];
  saudeCarteira: { saudavel: number; atencao: number; risco: number; altoRisco: number };
}

export interface RadarAlert {
  id: string;
  level: "ATENCAO" | "OPORTUNIDADE" | "DESTAQUE" | "INFORMACAO";
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  evidence: Record<string, unknown>;
  createdAt: string;
}

export interface ClientHealth {
  status: "SAUDAVEL" | "ATENCAO" | "RISCO" | "ALTO_RISCO";
  score: number;
  daysSinceLastOrder: number | null;
  avgIntervalDays: number | null;
  revenueChangePct: number | null;
  ticketChangePct: number | null;
  reasons: string[];
}

export interface ClientListItem {
  id: string;
  legalName: string;
  cnpj: string;
  city: string;
  uf: string | null;
  segment: string;
  classification: "A" | "B" | "C";
  vendor: { id: string; name: string };
  totalRevenue: number;
  pedidos: number;
  health: ClientHealth;
}

export interface ReactivationItem {
  clientId: string;
  vendorId: string;
  legalName: string;
  status: string;
  faturamentoMedioMensal: number;
  diasSemComprar: number | null;
  frequenciaHistoricaDias: number | null;
  quedaPercentual: number | null;
  motivo: string;
  score: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "ATRASADA";
  priority: "ALTA" | "MEDIA" | "BAIXA";
  dueDate: string | null;
  assignee?: { id: string; name: string };
  client?: { id: string; legalName: string } | null;
}

export interface Goal {
  id: string;
  scope: string;
  period: string;
  refDate: string;
  targetValue: number;
  vendor: { id: string; name: string } | null;
  realizado: number;
  gap: number;
  percentual: number | null;
}

export interface RadarAlertDraft {
  level: "ATENCAO" | "OPORTUNIDADE" | "DESTAQUE" | "INFORMACAO";
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  evidence: Record<string, unknown>;
}

export interface MeuDiaResponse {
  prioridadeAlta: RadarAlertDraft[];
  acompanhar: RadarAlertDraft[];
  oportunidades: ReactivationItem[];
  destaques: RadarAlertDraft[];
  tarefasHoje: Task[];
}
