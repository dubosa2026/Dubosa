import {
  CATEGORIAS_COMERCIAIS,
  CATEGORIAS_OPERACIONAIS,
  CATEGORIAS_TEMPO,
  type CategoriaTempo,
  type RegistroTempo,
} from "./types";
import { declarado, type Medida } from "./provenance";

export interface TempoPorCategoria {
  categoria: CategoriaTempo;
  segundos: number;
}

/**
 * Tudo aqui é TEMPO DECLARADO: o que o vendedor informou pelo cronômetro.
 * Os nomes dos campos carregam isso de propósito, para que nenhuma tela
 * consiga exibir esses números como comprovação de atividade.
 */
export interface ResumoTempoDeclarado {
  porCategoria: TempoPorCategoria[];
  totalDeclarado: Medida<number>;
  comercialDeclarado: Medida<number>;
  operacionalDeclarado: Medida<number>;
  /**
   * Percentual do tempo declarado que caiu em categorias comerciais.
   * Excluí PAUSA da base: o FOCO não cobra pausa de ninguém, então contá-la
   * como denominador puniria quem almoça.
   */
  percentComercialDeclarado: number;
}

export function duracaoSegundos(registro: RegistroTempo, agora: Date = new Date()): number {
  const inicio = new Date(registro.inicio).getTime();
  const fim = registro.fim ? new Date(registro.fim).getTime() : agora.getTime();
  return Math.max(0, Math.round((fim - inicio) / 1000));
}

export function somarPorCategoria(
  registros: RegistroTempo[],
  agora: Date = new Date()
): TempoPorCategoria[] {
  const totais = new Map<CategoriaTempo, number>(CATEGORIAS_TEMPO.map((c) => [c, 0]));
  for (const registro of registros) {
    totais.set(registro.categoria, (totais.get(registro.categoria) ?? 0) + duracaoSegundos(registro, agora));
  }
  return CATEGORIAS_TEMPO.map((categoria) => ({ categoria, segundos: totais.get(categoria) ?? 0 }));
}

export function resumirTempoDeclarado(
  registros: RegistroTempo[],
  agora: Date = new Date()
): ResumoTempoDeclarado {
  const porCategoria = somarPorCategoria(registros, agora);
  const soma = (cats: readonly CategoriaTempo[]) =>
    porCategoria.filter((c) => cats.includes(c.categoria)).reduce((acc, c) => acc + c.segundos, 0);

  const total = porCategoria.reduce((acc, c) => acc + c.segundos, 0);
  const comercial = soma(CATEGORIAS_COMERCIAIS);
  const operacional = soma(CATEGORIAS_OPERACIONAIS);
  const pausa = porCategoria.find((c) => c.categoria === "PAUSA")?.segundos ?? 0;
  const baseTrabalho = total - pausa;

  return {
    porCategoria,
    totalDeclarado: declarado(total, "soma dos blocos do cronômetro no período"),
    comercialDeclarado: declarado(comercial, "blocos declarados como Comercial e Atendimento a cliente"),
    operacionalDeclarado: declarado(
      operacional,
      "blocos declarados como Problema operacional e Administrativo"
    ),
    percentComercialDeclarado:
      baseTrabalho === 0 ? 0 : Math.round((comercial / baseTrabalho) * 1000) / 10,
  };
}

/** Formata segundos como "3h42" ou "50min". */
export function formatDuracao(totalSegundos: number): string {
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.round((totalSegundos % 3600) / 60);
  if (horas === 0) return `${minutos}min`;
  if (minutos === 0) return `${horas}h`;
  return `${horas}h${String(minutos).padStart(2, "0")}`;
}

/**
 * Quantas vezes o vendedor foi tirado de uma categoria comercial para uma
 * categoria operacional no período. É a medida de INTERRUPÇÃO — mais
 * reveladora que o tempo bruto, porque troca de contexto custa caro.
 */
export function contarInterrupcoes(registros: RegistroTempo[]): number {
  const ordenados = registros.slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
  let interrupcoes = 0;
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1].categoria;
    const atual = ordenados[i].categoria;
    if (CATEGORIAS_COMERCIAIS.includes(anterior) && CATEGORIAS_OPERACIONAIS.includes(atual)) {
      interrupcoes++;
    }
  }
  return interrupcoes;
}
