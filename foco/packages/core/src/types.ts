/**
 * Tipos centrais do domínio FOCO — Gestão do Tempo Comercial.
 *
 * O FOCO é uma camada gerencial de gestão do tempo, das interrupções e dos
 * problemas da equipe. Não é CRM, não gerencia pedidos, cotações, metas,
 * ranking ou vendas — esses sistemas continuam existindo separadamente.
 *
 * A pergunta que este domínio existe para responder é:
 * «O que está impedindo essa pessoa de dedicar mais tempo ao trabalho que
 * ela deveria estar fazendo?»
 *
 * Módulo puro: não depende de Electron, SQLite ou UI.
 */

export type Role = "VENDEDOR" | "GERENTE" | "ADMIN";

export interface User {
  id: string;
  nome: string;
  email: string;
  role: Role;
  /** Para vendedores: id do gerente responsável. */
  gerenteId?: string | null;
  ativo: boolean;
}

/* ------------------------------------------------------------------ */
/* Cronômetro — autodeclaração de atividade                            */
/* ------------------------------------------------------------------ */

/**
 * Categorias do cronômetro. São autodeclaradas pelo vendedor: representam
 * o que ele informou estar fazendo, nunca uma comprovação do que fez.
 */
export type CategoriaTempo =
  | "COMERCIAL"
  | "ATENDIMENTO"
  | "PROBLEMA_OPERACIONAL"
  | "REUNIAO"
  | "ADMINISTRATIVO"
  | "PAUSA";

export const CATEGORIAS_TEMPO: readonly CategoriaTempo[] = [
  "COMERCIAL",
  "ATENDIMENTO",
  "PROBLEMA_OPERACIONAL",
  "REUNIAO",
  "ADMINISTRATIVO",
  "PAUSA",
];

export const ROTULO_CATEGORIA_TEMPO: Record<CategoriaTempo, string> = {
  COMERCIAL: "Comercial",
  ATENDIMENTO: "Atendimento a cliente",
  PROBLEMA_OPERACIONAL: "Problema operacional",
  REUNIAO: "Reunião",
  ADMINISTRATIVO: "Administrativo",
  PAUSA: "Pausa",
};

/**
 * Categorias que representam tempo consumido por operação — o que o gerente
 * pode agir para reduzir. PAUSA fica de fora de propósito: pausa é descanso
 * legítimo, não obstáculo a ser eliminado, e o FOCO não existe para cobrar
 * pausas de ninguém.
 */
export const CATEGORIAS_OPERACIONAIS: readonly CategoriaTempo[] = [
  "PROBLEMA_OPERACIONAL",
  "ADMINISTRATIVO",
];

/** Categorias que o vendedor declara como trabalho junto ao cliente. */
export const CATEGORIAS_COMERCIAIS: readonly CategoriaTempo[] = ["COMERCIAL", "ATENDIMENTO"];

export interface RegistroTempo {
  id: string;
  userId: string;
  categoria: CategoriaTempo;
  inicio: string; // ISO 8601
  fim: string | null; // null enquanto em andamento
  /** Quando a categoria é PROBLEMA_OPERACIONAL, o problema que consumiu o tempo. */
  problemaId?: string | null;
  /** Registro de alterações feitas pelo vendedor neste bloco (auditoria). */
  alteracoes?: AlteracaoRegistro[];
}

export interface AlteracaoRegistro {
  em: string;
  de: CategoriaTempo;
  para: CategoriaTempo;
}

/* ------------------------------------------------------------------ */
/* Problemas operacionais                                              */
/* ------------------------------------------------------------------ */

export type CategoriaProblema =
  | "FINANCEIRO"
  | "LOGISTICA"
  | "CREDITO"
  | "CADASTRO"
  | "FISCAL"
  | "PRODUTO"
  | "COMERCIAL"
  | "OUTROS";

export const CATEGORIAS_PROBLEMA: readonly CategoriaProblema[] = [
  "FINANCEIRO",
  "LOGISTICA",
  "CREDITO",
  "CADASTRO",
  "FISCAL",
  "PRODUTO",
  "COMERCIAL",
  "OUTROS",
];

export const AREA_RESPONSAVEL_POR_CATEGORIA: Record<CategoriaProblema, string> = {
  FINANCEIRO: "Financeiro",
  LOGISTICA: "Logística",
  CREDITO: "Crédito",
  CADASTRO: "Cadastro",
  FISCAL: "Fiscal",
  PRODUTO: "Produto",
  COMERCIAL: "Comercial",
  OUTROS: "Outros",
};

export type Prioridade = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";

export type StatusProblema =
  | "NOVO"
  | "EM_ANALISE"
  | "ENCAMINHADO"
  | "AGUARDANDO_AREA"
  | "AGUARDANDO_VENDEDOR"
  | "RESOLVIDO"
  | "CANCELADO";

export const STATUS_PROBLEMA: readonly StatusProblema[] = [
  "NOVO",
  "EM_ANALISE",
  "ENCAMINHADO",
  "AGUARDANDO_AREA",
  "AGUARDANDO_VENDEDOR",
  "RESOLVIDO",
  "CANCELADO",
];

export const ROTULO_STATUS: Record<StatusProblema, string> = {
  NOVO: "Novo",
  EM_ANALISE: "Em análise",
  ENCAMINHADO: "Encaminhado",
  AGUARDANDO_AREA: "Aguardando área",
  AGUARDANDO_VENDEDOR: "Aguardando vendedor",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

/** Status em que o problema já saiu das mãos do vendedor e não deve mais consumir o tempo dele. */
export const STATUS_ENCERRADOS: readonly StatusProblema[] = ["RESOLVIDO", "CANCELADO"];

/** Como o problema entrou no FOCO — importante para o gerente saber o que é subnotificação. */
export type OrigemProblema = "REGISTRO_VENDEDOR" | "DETECCAO_EMAIL" | "DETECCAO_WHATSAPP";

export interface EventoProblema {
  em: string;
  status: StatusProblema;
  /** Quem moveu o problema. Pode ser o sistema, numa detecção automática. */
  por: string;
  nota?: string;
}

export interface Problema {
  id: string;
  protocolo: string;
  userId: string;
  cliente: string | null;
  descricao: string;
  categoria: CategoriaProblema;
  prioridade: Prioridade;
  areaResponsavel: string;
  /** Pessoa da área responsável que assumiu o caso, quando houver. */
  responsavel: string | null;
  status: StatusProblema;
  origem: OrigemProblema;
  /** Marcado quando o vendedor aciona "Estou preso neste problema". */
  preso: boolean;
  /** Respostas às perguntas rápidas do "Estou preso". */
  pedidoAjuda?: PedidoAjuda | null;
  criadoEm: string;
  atualizadoEm: string;
  resolvidoEm: string | null;
  historico: EventoProblema[];
}

export interface PedidoAjuda {
  em: string;
  precisaAgora: boolean;
  observacao?: string;
}

/* ------------------------------------------------------------------ */
/* Eventos identificados pelas integrações                             */
/* ------------------------------------------------------------------ */

export type FonteEvento = "EMAIL" | "WHATSAPP";

/**
 * Relevância de um evento. Nem todo e-mail é atividade operacional: uma
 * newsletter ou uma cópia sem necessidade de ação não podem entrar na conta
 * como interrupção de trabalho.
 */
export type Relevancia = "ALTA" | "MEDIA" | "BAIXA" | "IGNORAR";

export interface EventoIdentificado {
  id: string;
  userId: string;
  fonte: FonteEvento;
  ocorridoEm: string;
  /** Assunto do e-mail ou resumo da conversa. Nunca o conteúdo integral. */
  assunto: string;
  categoria: CategoriaProblema;
  relevancia: Relevancia;
  /** Quando a integração conseguiu associar a um cliente. */
  cliente?: string | null;
  /** Quando o evento foi ligado a um problema já registrado no FOCO. */
  problemaId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Classificação (IA ou regras)                                        */
/* ------------------------------------------------------------------ */

export interface ResultadoClassificacao {
  categoria: CategoriaProblema;
  prioridade: Prioridade;
  areaResponsavel: string;
  resumo: string;
}

/** Estratégia de classificação — trocável por uma IA real (ver classifier.ts). */
export interface ClassificadorProblema {
  classificar(descricao: string): Promise<ResultadoClassificacao> | ResultadoClassificacao;
}

export interface ResultadoRelevancia {
  categoria: CategoriaProblema;
  relevancia: Relevancia;
  motivo: string;
}

/** Estratégia de triagem de eventos vindos de e-mail/WhatsApp. */
export interface ClassificadorEvento {
  triar(assunto: string, remetente?: string): Promise<ResultadoRelevancia> | ResultadoRelevancia;
}
