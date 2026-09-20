import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { openDatabase } from "../src/db/database";
import { UserRepository } from "../src/db/repositories/userRepository";
import { TimeEntryRepository } from "../src/db/repositories/timeEntryRepository";
import { ProblemRepository } from "../src/db/repositories/problemRepository";
import { EventRepository } from "../src/db/repositories/eventRepository";
import { seedDemoData } from "../src/db/seed";
import { consolidarEquipe } from "../src/evidence";

describe("camada de persistência", () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  it("cria usuário e autentica com a senha correta", () => {
    const users = new UserRepository(db);
    const v = users.criar({ nome: "Teste", email: "t@foco.local", senha: "abc123", role: "VENDEDOR" });
    expect(users.autenticar("t@foco.local", "abc123")?.id).toBe(v.id);
    expect(users.autenticar("t@foco.local", "errada")).toBeNull();
  });

  it("não permite dois blocos em andamento para o mesmo vendedor", () => {
    const users = new UserRepository(db);
    const tempo = new TimeEntryRepository(db);
    const v = users.criar({ nome: "T", email: "t2@foco.local", senha: "abc123", role: "VENDEDOR" });
    tempo.iniciar(v.id, "COMERCIAL");
    expect(() => tempo.iniciar(v.id, "ATENDIMENTO")).toThrow();
  });

  it("guarda a alteração de categoria de um bloco para auditoria", () => {
    const users = new UserRepository(db);
    const tempo = new TimeEntryRepository(db);
    const v = users.criar({ nome: "T", email: "t3@foco.local", senha: "abc123", role: "VENDEDOR" });

    const bloco = tempo.iniciar(v.id, "COMERCIAL");
    const alterado = tempo.alterarCategoria(bloco.id, "PROBLEMA_OPERACIONAL");

    expect(alterado.categoria).toBe("PROBLEMA_OPERACIONAL");
    expect(alterado.alteracoes).toHaveLength(1);
    expect(alterado.alteracoes![0]).toMatchObject({ de: "COMERCIAL", para: "PROBLEMA_OPERACIONAL" });
  });

  it("registra problema com protocolo sequencial, status NOVO e histórico", () => {
    const users = new UserRepository(db);
    const problemas = new ProblemRepository(db);
    const v = users.criar({ nome: "T", email: "t4@foco.local", senha: "abc123", role: "VENDEDOR" });

    const p1 = problemas.registrar({
      userId: v.id, cliente: "A", descricao: "Pedido atrasado",
      categoria: "LOGISTICA", prioridade: "ALTA", areaResponsavel: "Logística",
    });
    const p2 = problemas.registrar({
      userId: v.id, cliente: "B", descricao: "Boleto duplicado",
      categoria: "FINANCEIRO", prioridade: "MEDIA", areaResponsavel: "Financeiro",
    });

    expect(p1.protocolo).toBe("#1");
    expect(p2.protocolo).toBe("#2");
    expect(p1.status).toBe("NOVO");
    expect(p1.historico).toHaveLength(1);
  });

  it("move o problema pelo ciclo de vida e recusa transição inválida", () => {
    const users = new UserRepository(db);
    const problemas = new ProblemRepository(db);
    const v = users.criar({ nome: "T", email: "t5@foco.local", senha: "abc123", role: "VENDEDOR" });
    const p = problemas.registrar({
      userId: v.id, descricao: "Pedido atrasado", categoria: "LOGISTICA",
      prioridade: "ALTA", areaResponsavel: "Logística",
    });

    const encaminhado = problemas.mover(p.id, "ENCAMINHADO", "vendedor");
    expect(encaminhado.status).toBe("ENCAMINHADO");
    expect(encaminhado.historico).toHaveLength(2);

    const resolvido = problemas.mover(p.id, "RESOLVIDO", "logistica", "carga localizada");
    expect(resolvido.resolvidoEm).not.toBeNull();

    expect(() => problemas.mover(p.id, "NOVO", "vendedor")).toThrow(/Transição inválida/);
  });

  it("guarda as respostas das perguntas rápidas do 'Estou preso'", () => {
    const users = new UserRepository(db);
    const problemas = new ProblemRepository(db);
    const v = users.criar({ nome: "T", email: "t6@foco.local", senha: "abc123", role: "VENDEDOR" });
    const p = problemas.registrar({
      userId: v.id, descricao: "Crédito bloqueado", categoria: "CREDITO",
      prioridade: "ALTA", areaResponsavel: "Crédito",
    });

    const preso = problemas.marcarPreso(p.id, { precisaAgora: true, observacao: "cliente esperando" });
    expect(preso.preso).toBe(true);
    expect(preso.pedidoAjuda?.precisaAgora).toBe(true);
    expect(preso.pedidoAjuda?.observacao).toBe("cliente esperando");
    expect(problemas.listarPresos().map((x) => x.id)).toContain(p.id);
  });

  it("não duplica eventos identificados ao reprocessar a mesma caixa", () => {
    const users = new UserRepository(db);
    const eventos = new EventRepository(db);
    const v = users.criar({ nome: "T", email: "t7@foco.local", senha: "abc123", role: "VENDEDOR" });

    const lote = [
      {
        id: "email:1", userId: v.id, fonte: "EMAIL" as const, ocorridoEm: "2026-01-01T09:00:00Z",
        assunto: "Pendência de faturamento", categoria: "FINANCEIRO" as const, relevancia: "ALTA" as const,
      },
    ];
    expect(eventos.registrarVarios(lote)).toBe(1);
    expect(eventos.registrarVarios(lote)).toBe(0);
    expect(eventos.listarNoPeriodo("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toHaveLength(1);
  });

  it("o seed popula um cenário consolidável e não duplica em nova execução", () => {
    seedDemoData(db);
    const users = new UserRepository(db);
    const total = users.listarTodos().length;
    expect(total).toBeGreaterThan(10);

    seedDemoData(db);
    expect(users.listarTodos().length).toBe(total);

    const tempo = new TimeEntryRepository(db);
    const problemas = new ProblemRepository(db);
    const eventos = new EventRepository(db);
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
    const fim = new Date(); fim.setHours(23, 59, 59, 999);

    const vendedores = users.listarTodos().filter((u) => u.role === "VENDEDOR");
    const visao = consolidarEquipe(
      vendedores.map((v) => v.id),
      { inicio: inicio.toISOString(), fim: fim.toISOString() },
      tempo.listarNoPeriodo(inicio.toISOString(), fim.toISOString()),
      problemas.listarNoPeriodo(inicio.toISOString(), fim.toISOString()),
      eventos.listarNoPeriodo(inicio.toISOString(), fim.toISOString())
    );

    expect(visao.tempoEquipe.totalDeclarado.valor).toBeGreaterThan(0);
    expect(visao.tempoEquipe.totalDeclarado.origem).toBe("DECLARADO");
    expect(visao.porVendedor).toHaveLength(vendedores.length);
    expect(visao.problemasAbertos).toBeGreaterThan(0);
    expect(visao.totalVendedores).toBe(vendedores.length);
  });
});
