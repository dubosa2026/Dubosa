import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { RuleBasedProblemClassifier } from "../classifier";
import type { IntegratorActionType, ProblemCategory, TimeCategory } from "../types";
import { ProblemRepository } from "./repositories/problemRepository";
import { TimeEntryRepository } from "./repositories/timeEntryRepository";
import { UserRepository } from "./repositories/userRepository";

const NOMES_VENDEDORES = [
  "Ana Beatriz",
  "Bruno Castro",
  "Carla Dias",
  "Diego Esteves",
  "Elaine Farias",
  "Fábio Gomes",
  "Giovana Horta",
  "Henrique Iório",
  "Isabela Junqueira",
  "João Klein",
];

const CLIENTES_DEMO = [
  "Solar Pontal Integradora",
  "Helios Engenharia Solar",
  "Fotovolt Distribuidora",
  "Verde Sol Energia",
  "Norte Solar Instalações",
  "Amazônia Fotovoltaica",
];

const DESCRICOES_PROBLEMA_DEMO = [
  "Cliente está reclamando que o pedido ainda não foi faturado.",
  "O pedido está atrasado e a transportadora não dá previsão de entrega.",
  "Cliente com limite de crédito bloqueado, não consegue fechar o pedido.",
  "Nota fiscal veio com ICMS calculado errado, preciso de ajuste fiscal urgente.",
  "Cadastro do cliente está com endereço de entrega desatualizado.",
  "Cliente recebeu um inversor com defeito, precisa de garantia.",
  "Cliente quer negociar desconto por volume para fechar hoje.",
];

function isoDiasAtras(dias: number, horas = 9, minutos = 0): string {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  data.setHours(horas, minutos, 0, 0);
  return data.toISOString();
}

function escolher<T>(lista: T[], indice: number): T {
  return lista[indice % lista.length];
}

/**
 * Popula o banco com dados de demonstração (gerente, equipe de vendedores,
 * registros de tempo de hoje, chamados classificados e ações de autonomia
 * das últimas semanas) para que as telas do FOCO já nasçam com conteúdo
 * realista para validação e demos.
 */
export function seedDemoData(db: Database): void {
  const users = new UserRepository(db);
  const timeEntries = new TimeEntryRepository(db);
  const problems = new ProblemRepository(db);
  const classifier = new RuleBasedProblemClassifier();

  if (users.listarTodos().length > 0) return; // já existe dado, não duplica

  const gerente = users.criar({
    nome: "Marcelo Andrade",
    email: "gerente@foco.local",
    senha: "foco123",
    role: "GERENTE",
  });

  const vendedores = NOMES_VENDEDORES.map((nome, i) =>
    users.criar({
      nome,
      email: `vendedor${i + 1}@foco.local`,
      senha: "foco123",
      role: "VENDEDOR",
      gerenteId: gerente.id,
    })
  );

  users.criar({ nome: "Admin FOCO", email: "admin@foco.local", senha: "foco123", role: "ADMIN" });

  // Tempo de hoje: cada vendedor recebe uma combinação plausível de blocos.
  const categoriasHoje: TimeCategory[][] = [
    ["PROSPECCAO", "NEGOCIACAO", "FOLLOWUP"],
    ["PROSPECCAO", "PROBLEMA", "COTACAO_OPERACIONAL"],
    ["PROSPECCAO", "PROSPECCAO", "NEGOCIACAO"],
    ["FOLLOWUP", "PROBLEMA", "PROBLEMA"],
    ["PROSPECCAO", "COTACAO_OPERACIONAL", "OUTROS"],
  ];

  vendedores.forEach((vendedor, i) => {
    const combinacao = escolher(categoriasHoje, i);
    let horaAtual = 8;
    for (const categoria of combinacao) {
      const duracaoMin = 30 + ((i * 13 + categoria.length * 7) % 60);
      const inicio = new Date();
      inicio.setHours(horaAtual, 0, 0, 0);
      const fim = new Date(inicio.getTime() + duracaoMin * 60_000);
      horaAtual += Math.ceil(duracaoMin / 60) + 1;

      let problemaId: string | null = null;
      if (categoria === "PROBLEMA") {
        const descricao = escolher(DESCRICOES_PROBLEMA_DEMO, i);
        const classificacao = classifier.classify(descricao);
        const problema = problems.registrar({
          userId: vendedor.id,
          cliente: escolher(CLIENTES_DEMO, i),
          descricao,
          categoria: classificacao.categoria as ProblemCategory,
          prioridade: classificacao.prioridade,
          areaResponsavel: classificacao.areaResponsavel,
        });
        problemaId = problema.id;
        if (i === 3) problems.marcarPreso(problema.id); // demonstra um caso "estou preso"
      }

      db.prepare(
        "INSERT INTO time_entries (id, user_id, categoria, inicio, fim, problema_id) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), vendedor.id, categoria, inicio.toISOString(), fim.toISOString(), problemaId);
    }
  });

  // Um vendedor com prospecção em andamento agora (para a tela do gerente mostrar "em prospecção").
  timeEntries.iniciar(vendedores[0].id, "PROSPECCAO");

  // Ações de autonomia do integrador nas últimas 4 semanas, evoluindo de ~35% para ~58%.
  const tipos: IntegratorActionType[] = ["COTACAO", "PEDIDO", "CONSULTA_PRECO", "CONSULTA_ESTOQUE", "CONSULTA_FRETE"];
  const percentIntegradorPorSemana = [0.35, 0.42, 0.5, 0.58];
  percentIntegradorPorSemana.forEach((percentIntegrador, semanaIndex) => {
    const diasAtras = (3 - semanaIndex) * 7;
    for (let acao = 0; acao < 20; acao++) {
      const vendedor = escolher(vendedores, acao + semanaIndex);
      const cliente = escolher(CLIENTES_DEMO, acao);
      const tipo = escolher(tipos, acao);
      const origem = acao / 20 < percentIntegrador ? "INTEGRADOR" : "VENDEDOR";
      const dataAcao = isoDiasAtras(diasAtras + (acao % 6), 9 + (acao % 8));
      db.prepare(
        "INSERT INTO integrator_actions (id, user_id, cliente, tipo, origem, criado_em) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), vendedor.id, cliente, tipo, origem, dataAcao);
    }
  });

  // Cliente propositalmente com baixa autonomia digital, para o alerta 🔴.
  for (let i = 0; i < 10; i++) {
    db.prepare(
      "INSERT INTO integrator_actions (id, user_id, cliente, tipo, origem, criado_em) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      vendedores[1].id,
      "Solar Pontal Integradora",
      i % 2 === 0 ? "COTACAO" : "PEDIDO",
      i === 0 ? "INTEGRADOR" : "VENDEDOR",
      isoDiasAtras(i)
    );
  }
}
