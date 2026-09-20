import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { ClassificadorPorRegras, TriadorPorRegras } from "../classifier";
import type { CategoriaTempo, StatusProblema } from "../types";
import { EventRepository } from "./repositories/eventRepository";
import { ProblemRepository } from "./repositories/problemRepository";
import { UserRepository } from "./repositories/userRepository";

const NOMES_VENDEDORES = [
  "Ana Beatriz", "Bruno Castro", "Carla Dias", "Diego Esteves", "Elaine Farias",
  "Fábio Gomes", "Giovana Horta", "Henrique Iório", "Isabela Junqueira", "Rafael Klein",
];

const CLIENTES = [
  "Solar Pontal Integradora", "Helios Engenharia Solar", "Fotovolt Distribuidora",
  "Verde Sol Energia", "Norte Solar Instalações", "Amazônia Fotovoltaica",
];

/**
 * Descrições de problema reais o bastante para o agrupamento de
 * recorrência ter o que encontrar: note que vários falam de faturamento
 * travado, que é justamente o padrão que o insight deve apontar.
 */
const PROBLEMAS_DEMO = [
  "Pedido faturado há três dias e o boleto ainda não chegou para o cliente.",
  "Cliente reclamando que o pedido ainda não foi faturado, já são dois dias parados.",
  "Faturamento travado, o pedido não sai do sistema e o cliente está cobrando.",
  "O pedido está atrasado e a transportadora não dá previsão de entrega.",
  "Entrega extraviada, transportadora não localiza a carga.",
  "Cliente com limite de crédito bloqueado, não consegue fechar o pedido.",
  "Cadastro do cliente está com endereço de entrega desatualizado.",
  "ICMS calculado errado na nota, preciso de ajuste fiscal urgente.",
];

const ASSUNTOS_EMAIL = [
  { assunto: "RE: Pendência de faturamento do pedido 88231", remetente: "financeiro@empresa.com.br" },
  { assunto: "Boleto em aberto — cliente Solar Pontal", remetente: "financeiro@empresa.com.br" },
  { assunto: "Previsão de entrega pedido 88102", remetente: "logistica@empresa.com.br" },
  { assunto: "Análise de crédito pendente", remetente: "credito@empresa.com.br" },
  { assunto: "Newsletter Setembro — Novidades do setor solar", remetente: "marketing@fornecedor.com" },
  { assunto: "Você está em cópia: alteração cadastral", remetente: "cadastro@empresa.com.br" },
  { assunto: "Nota fiscal com ICMS divergente", remetente: "fiscal@empresa.com.br" },
];

function horaDeHoje(hora: number, minuto = 0): Date {
  const d = new Date();
  d.setHours(hora, minuto, 0, 0);
  return d;
}

function escolher<T>(lista: T[], i: number): T {
  return lista[i % lista.length];
}

/**
 * Popula um cenário de demonstração: uma equipe, um dia de cronômetro
 * declarado, chamados em vários estágios do ciclo de vida e eventos
 * identificados de e-mail — inclusive os irrelevantes, para a triagem
 * ter o que descartar.
 */
export function seedDemoData(db: Database): void {
  const users = new UserRepository(db);
  const problems = new ProblemRepository(db);
  const events = new EventRepository(db);
  const classificador = new ClassificadorPorRegras();
  const triador = new TriadorPorRegras();

  if (users.listarTodos().length > 0) return;

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

  const inserirRegistro = db.prepare(
    "INSERT INTO time_entries (id, user_id, categoria, inicio, fim, problema_id, alteracoes) VALUES (?, ?, ?, ?, ?, ?, '[]')"
  );

  // Cada vendedor recebe um dia plausível. O quarto padrão é de alguém
  // соbrado por operação o dia inteiro — é o caso que o gerente precisa ver.
  const PADROES: CategoriaTempo[][] = [
    ["COMERCIAL", "ATENDIMENTO", "PAUSA", "COMERCIAL"],
    ["COMERCIAL", "PROBLEMA_OPERACIONAL", "COMERCIAL", "PAUSA", "ATENDIMENTO"],
    ["REUNIAO", "COMERCIAL", "PAUSA", "COMERCIAL", "ADMINISTRATIVO"],
    ["PROBLEMA_OPERACIONAL", "COMERCIAL", "PROBLEMA_OPERACIONAL", "PAUSA", "PROBLEMA_OPERACIONAL"],
    ["COMERCIAL", "ATENDIMENTO", "ADMINISTRATIVO", "PAUSA", "COMERCIAL"],
  ];

  const DURACOES: Record<CategoriaTempo, number> = {
    COMERCIAL: 95,
    ATENDIMENTO: 55,
    PROBLEMA_OPERACIONAL: 48,
    REUNIAO: 45,
    ADMINISTRATIVO: 35,
    PAUSA: 60,
  };

  vendedores.forEach((vendedor, i) => {
    const padrao = escolher(PADROES, i);
    let minutoAtual = 8 * 60;

    padrao.forEach((categoria, j) => {
      const duracao = DURACOES[categoria] + ((i * 7 + j * 11) % 20);
      const inicio = horaDeHoje(Math.floor(minutoAtual / 60), minutoAtual % 60);
      const fim = new Date(inicio.getTime() + duracao * 60_000);
      minutoAtual += duracao + 5;

      let problemaId: string | null = null;
      if (categoria === "PROBLEMA_OPERACIONAL") {
        const descricao = escolher(PROBLEMAS_DEMO, i + j);
        const c = classificador.classificar(descricao);
        const problema = problems.registrar({
          userId: vendedor.id,
          cliente: escolher(CLIENTES, i + j),
          descricao,
          categoria: c.categoria,
          prioridade: c.prioridade,
          areaResponsavel: c.areaResponsavel,
        });
        problemaId = problema.id;

        // Espalha o ciclo de vida para o painel mostrar estágios diferentes.
        const trilha: StatusProblema[][] = [
          ["EM_ANALISE", "ENCAMINHADO"],
          ["ENCAMINHADO", "AGUARDANDO_AREA"],
          ["EM_ANALISE", "RESOLVIDO"],
          ["ENCAMINHADO"],
        ];
        for (const status of escolher(trilha, i + j)) {
          problems.mover(problema.id, status, "sistema", "movimentação de demonstração");
        }

        // Um vendedor preso há bastante tempo, para o alerta crítico disparar.
        if (i === 3 && j === 0) {
          problems.marcarPreso(problema.id, {
            precisaAgora: true,
            observacao: "Já falei com a área duas vezes e não tive retorno.",
          });
        }
      }

      inserirRegistro.run(
        randomUUID(),
        vendedor.id,
        categoria,
        inicio.toISOString(),
        fim.toISOString(),
        problemaId
      );
    });
  });

  // Eventos identificados de e-mail — passando pela triagem de verdade,
  // então a newsletter e a cópia sem ação são descartadas ou rebaixadas.
  const eventos = [];
  for (let i = 0; i < 24; i++) {
    const vendedor = escolher(vendedores, i);
    const { assunto, remetente } = escolher(ASSUNTOS_EMAIL, i);
    const triagem = triador.triar(assunto, remetente);
    if (triagem.relevancia === "IGNORAR") continue;

    const hora = 8 + (i % 9);
    eventos.push({
      id: `email:demo-${i}`,
      userId: vendedor.id,
      fonte: "EMAIL" as const,
      ocorridoEm: horaDeHoje(hora, (i * 7) % 60).toISOString(),
      assunto,
      categoria: triagem.categoria,
      relevancia: triagem.relevancia,
      cliente: null,
      problemaId: null,
    });
  }
  events.registrarVarios(eventos);
}
