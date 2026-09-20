import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { openDatabase } from "../src/db/database";
import { UserRepository } from "../src/db/repositories/userRepository";
import { TimeEntryRepository } from "../src/db/repositories/timeEntryRepository";
import { ProblemRepository } from "../src/db/repositories/problemRepository";
import { IntegratorActionRepository } from "../src/db/repositories/integratorActionRepository";
import { seedDemoData } from "../src/db/seed";
import { computeFocoComercial } from "../src/focoIndex";

describe("camada de persistência", () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  it("cria usuário e autentica com a senha correta", () => {
    const users = new UserRepository(db);
    const vendedor = users.criar({ nome: "Teste", email: "teste@foco.local", senha: "abc123", role: "VENDEDOR" });
    expect(users.autenticar("teste@foco.local", "abc123")?.id).toBe(vendedor.id);
    expect(users.autenticar("teste@foco.local", "senhaerrada")).toBeNull();
  });

  it("não permite dois registros de tempo em andamento para o mesmo vendedor", () => {
    const users = new UserRepository(db);
    const timeEntries = new TimeEntryRepository(db);
    const vendedor = users.criar({ nome: "Teste", email: "t2@foco.local", senha: "abc123", role: "VENDEDOR" });

    timeEntries.iniciar(vendedor.id, "PROSPECCAO");
    expect(() => timeEntries.iniciar(vendedor.id, "NEGOCIACAO")).toThrow();
  });

  it("inicia e para um bloco de prospecção corretamente", () => {
    const users = new UserRepository(db);
    const timeEntries = new TimeEntryRepository(db);
    const vendedor = users.criar({ nome: "Teste", email: "t3@foco.local", senha: "abc123", role: "VENDEDOR" });

    const entry = timeEntries.iniciar(vendedor.id, "PROSPECCAO");
    expect(entry.fim).toBeNull();
    const parado = timeEntries.parar(entry.id);
    expect(parado.fim).not.toBeNull();
    expect(timeEntries.buscarEmAndamento(vendedor.id)).toBeNull();
  });

  it("registra um problema, gera protocolo sequencial e permite marcar 'estou preso'", () => {
    const users = new UserRepository(db);
    const problems = new ProblemRepository(db);
    const vendedor = users.criar({ nome: "Teste", email: "t4@foco.local", senha: "abc123", role: "VENDEDOR" });

    const p1 = problems.registrar({
      userId: vendedor.id,
      cliente: "Cliente A",
      descricao: "Pedido atrasado",
      categoria: "LOGISTICA",
      prioridade: "ALTA",
      areaResponsavel: "Logística",
    });
    const p2 = problems.registrar({
      userId: vendedor.id,
      cliente: "Cliente B",
      descricao: "Boleto duplicado",
      categoria: "FINANCEIRO",
      prioridade: "MEDIA",
      areaResponsavel: "Financeiro",
    });

    expect(p1.protocolo).toBe("#1");
    expect(p2.protocolo).toBe("#2");
    expect(p1.status).toBe("ABERTO");

    const marcado = problems.marcarPreso(p1.id);
    expect(marcado.preso).toBe(true);
    expect(problems.listarPresos().map((p) => p.id)).toContain(p1.id);
  });

  it("registra ações do integrador com origem correta", () => {
    const users = new UserRepository(db);
    const actions = new IntegratorActionRepository(db);
    const vendedor = users.criar({ nome: "Teste", email: "t5@foco.local", senha: "abc123", role: "VENDEDOR" });

    actions.registrar({ userId: vendedor.id, cliente: "Cliente A", tipo: "COTACAO", origem: "INTEGRADOR" });
    actions.registrar({ userId: vendedor.id, cliente: "Cliente A", tipo: "PEDIDO", origem: "VENDEDOR" });

    const registradas = actions.listarPorUsuario(vendedor.id);
    expect(registradas).toHaveLength(2);
  });

  it("o seed de demonstração popula usuários, tempo e chamados sem duplicar em execuções repetidas", () => {
    seedDemoData(db);
    const users = new UserRepository(db);
    const totalAntes = users.listarTodos().length;
    expect(totalAntes).toBeGreaterThan(10); // 10 vendedores + gerente + admin

    seedDemoData(db); // segunda chamada não deve duplicar
    expect(users.listarTodos().length).toBe(totalAntes);

    const timeEntries = new TimeEntryRepository(db);
    const vendedores = users.listarTodosVendedores();
    const entriesDoPrimeiro = timeEntries.listarPorUsuarioNoPeriodo(
      vendedores[0].id,
      "2000-01-01T00:00:00Z",
      "2100-01-01T00:00:00Z"
    );
    expect(entriesDoPrimeiro.length).toBeGreaterThan(0);

    const resumo = computeFocoComercial(entriesDoPrimeiro);
    expect(resumo.totalSegundos).toBeGreaterThan(0);
  });
});
