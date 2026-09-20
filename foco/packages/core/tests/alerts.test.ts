import { describe, expect, it } from "vitest";
import { CONFIG_ALERTAS_PADRAO, gerarAlertas } from "../src/alerts";
import { consolidarEquipe } from "../src/evidence";
import { gerarInsights } from "../src/insights";
import type { Problema, RegistroTempo, User } from "../src/types";

const PERIODO = { inicio: "2026-01-01T00:00:00Z", fim: "2026-01-02T00:00:00Z" };
const AGORA = new Date("2026-01-01T18:00:00Z");

const USUARIOS: User[] = [
  { id: "v1", nome: "Rafael", email: "r@x", role: "VENDEDOR", ativo: true },
  { id: "v2", nome: "Ana", email: "a@x", role: "VENDEDOR", ativo: true },
  { id: "v3", nome: "Bruno", email: "b@x", role: "VENDEDOR", ativo: true },
];

function bloco(minutos: number, userId: string, problemaId?: string, hora = 9): RegistroTempo {
  const inicio = new Date(`2026-01-01T${String(hora).padStart(2, "0")}:00:00Z`);
  return {
    id: crypto.randomUUID(),
    userId,
    categoria: "PROBLEMA_OPERACIONAL",
    inicio: inicio.toISOString(),
    fim: new Date(inicio.getTime() + minutos * 60_000).toISOString(),
    problemaId,
  };
}

function problema(over: Partial<Problema> = {}): Problema {
  return {
    id: over.id ?? crypto.randomUUID(),
    protocolo: over.protocolo ?? "#100",
    userId: "v1",
    cliente: "Cliente A",
    descricao: "Pedido faturado e boleto não chegou",
    categoria: "FINANCEIRO",
    prioridade: "ALTA",
    areaResponsavel: "Financeiro",
    responsavel: null,
    status: "ENCAMINHADO",
    origem: "REGISTRO_VENDEDOR",
    preso: false,
    pedidoAjuda: null,
    criadoEm: "2026-01-01T09:00:00Z",
    atualizadoEm: "2026-01-01T09:00:00Z",
    resolvidoEm: null,
    historico: [],
    ...over,
  };
}

function montar(registros: RegistroTempo[], problemas: Problema[]) {
  const visaoEquipe = consolidarEquipe(["v1", "v2", "v3"], PERIODO, registros, problemas, [], AGORA);
  return { visaoEquipe, problemas, registros, usuarios: USUARIOS, agora: AGORA };
}

describe("gerarAlertas", () => {
  it("dispara alerta crítico quando o vendedor está preso há tempo demais", () => {
    const p = problema({ id: "p1", preso: true, protocolo: "#101" });
    const alertas = gerarAlertas(montar([bloco(52, "v1", "p1")], [p]));
    const preso = alertas.find((a) => a.id === "preso:p1");
    expect(preso?.severidade).toBe("CRITICO");
    expect(preso?.texto).toContain("Rafael");
    expect(preso?.texto).toContain("#101");
    expect(preso?.origem).toBe("DECLARADO");
  });

  it("não dispara alerta de preso abaixo do limiar configurado", () => {
    const p = problema({ id: "p1", preso: true });
    const alertas = gerarAlertas(montar([bloco(10, "v1", "p1")], [p]));
    expect(alertas.find((a) => a.id === "preso:p1")).toBeUndefined();
  });

  it("respeita limiar customizado", () => {
    const p = problema({ id: "p1", preso: true });
    const dados = montar([bloco(20, "v1", "p1")], [p]);
    const alertas = gerarAlertas({
      ...dados,
      config: { ...CONFIG_ALERTAS_PADRAO, minutosPresoEmProblema: 15 },
    });
    expect(alertas.find((a) => a.id === "preso:p1")).toBeDefined();
  });

  it("permite desligar uma família de alertas", () => {
    const p = problema({ id: "p1", preso: true });
    const dados = montar([bloco(60, "v1", "p1")], [p]);
    const alertas = gerarAlertas({
      ...dados,
      config: { ...CONFIG_ALERTAS_PADRAO, ativos: { ...CONFIG_ALERTAS_PADRAO.ativos, preso: false } },
    });
    expect(alertas.find((a) => a.id === "preso:p1")).toBeUndefined();
  });

  it("aponta problema coletivo quando vários vendedores são atingidos", () => {
    const problemas = [
      problema({ id: "p1", userId: "v1" }),
      problema({ id: "p2", userId: "v2" }),
      problema({ id: "p3", userId: "v3" }),
    ];
    const alertas = gerarAlertas(montar([], problemas));
    const coletivo = alertas.find((a) => a.id.startsWith("coletivo:"));
    expect(coletivo?.severidade).toBe("CRITICO");
    expect(coletivo?.texto).toContain("3 vendedores");
  });

  it("todo alerta carrega origem e evidência", () => {
    const alertas = gerarAlertas(montar([bloco(120, "v1", "p1")], [problema({ id: "p1", preso: true })]));
    expect(alertas.length).toBeGreaterThan(0);
    for (const a of alertas) {
      expect(a.origem).toBeDefined();
      expect(a.evidencia.length).toBeGreaterThan(0);
    }
  });

  it("ordena críticos antes de atenção e positivos", () => {
    const problemas = [
      problema({ id: "p1", userId: "v1", preso: true }),
      problema({ id: "p2", userId: "v2", status: "RESOLVIDO", resolvidoEm: "2026-01-01T12:00:00Z" }),
    ];
    const alertas = gerarAlertas(montar([bloco(120, "v1", "p1")], problemas));
    const severidades = alertas.map((a) => a.severidade);
    expect(severidades.indexOf("CRITICO")).toBeLessThan(severidades.lastIndexOf("POSITIVO"));
  });
});

describe("gerarInsights", () => {
  it("aponta a área que mais consome tempo, com evidências", () => {
    const problemas = [problema({ id: "p1" })];
    const visaoEquipe = consolidarEquipe(["v1"], PERIODO, [bloco(90, "v1", "p1")], problemas, [], AGORA);
    const insights = gerarInsights({ visaoEquipe, problemas, usuarios: USUARIOS });
    const area = insights.find((i) => i.id.startsWith("area:"));
    expect(area?.titulo).toContain("Financeiro");
    expect(area?.evidencias.length).toBeGreaterThan(0);
    expect(area?.sugestao).toBeTruthy();
  });

  it("marca a estimativa de tempo recuperável como ESTIMADO", () => {
    const problemas = [problema({ id: "p1" })];
    const visaoEquipe = consolidarEquipe(["v1"], PERIODO, [bloco(90, "v1", "p1")], problemas, [], AGORA);
    const insights = gerarInsights({ visaoEquipe, problemas, usuarios: USUARIOS });
    const recuperavel = insights.find((i) => i.id === "recuperavel");
    expect(recuperavel?.origem).toBe("ESTIMADO");
    expect(recuperavel?.corpo).toContain("estimativa");
  });

  it("identifica padrão recorrente entre chamados parecidos", () => {
    const problemas = [
      problema({ id: "p1", userId: "v1", descricao: "Boleto do pedido faturado não chegou ao cliente" }),
      problema({ id: "p2", userId: "v2", descricao: "Cliente cobrando boleto do pedido faturado" }),
      problema({ id: "p3", userId: "v3", descricao: "Boleto pendente do pedido faturado ontem" }),
    ];
    const visaoEquipe = consolidarEquipe(["v1", "v2", "v3"], PERIODO, [], problemas, [], AGORA);
    const insights = gerarInsights({ visaoEquipe, problemas, usuarios: USUARIOS });
    expect(insights.find((i) => i.id.startsWith("recorrencia:"))).toBeDefined();
  });
});
