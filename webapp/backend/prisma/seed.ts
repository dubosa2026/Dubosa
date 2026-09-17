import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NORTE_UFS = [
  { uf: "AC", name: "Acre" },
  { uf: "AM", name: "Amazonas" },
  { uf: "AP", name: "Amapá" },
  { uf: "PA", name: "Pará" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "TO", name: "Tocantins" },
];

const SEGMENTS = ["Material de Construção", "Varejo", "Atacado", "Indústria", "Agropecuária"];
const PRODUCTS = [
  { name: "Kit Solar 3kWp", category: "Energia Solar" },
  { name: "Kit Solar 5kWp", category: "Energia Solar" },
  { name: "Inversor 5kW", category: "Componentes" },
  { name: "Painel Fotovoltaico 550W", category: "Componentes" },
  { name: "Bateria de Lítio 5kWh", category: "Armazenamento" },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomCnpj(seed: number): string {
  const base = String(seed).padStart(8, "0");
  return `${base.slice(0, 2)}.${base.slice(2, 5)}.${base.slice(5, 8)}/0001-${String(seed % 100).padStart(2, "0")}`;
}

const VENDORS = [
  { name: "Rafael Almeida", email: "rafael@copiloto.demo" },
  { name: "João Pedro Souza", email: "joao@copiloto.demo" },
  { name: "Marina Costa", email: "marina@copiloto.demo" },
  { name: "Camila Ferreira", email: "camila@copiloto.demo" },
  { name: "Bruno Lima", email: "bruno@copiloto.demo" },
];

async function main() {
  console.log("Limpando dados demo anteriores...");
  await prisma.aIAnalysis.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.clientHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.client.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.state.deleteMany();
  await prisma.region.deleteMany();

  console.log("Criando regiões e estados...");
  const norte = await prisma.region.create({ data: { name: "Norte" } });
  const states = await Promise.all(
    NORTE_UFS.map((s) => prisma.state.create({ data: { uf: s.uf, name: s.name, regionId: norte.id } }))
  );

  console.log("Criando produtos...");
  const products = await Promise.all(PRODUCTS.map((p) => prisma.product.create({ data: p })));

  console.log("Criando usuários (DEMO)...");
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const admin = await prisma.user.create({
    data: { name: "Admin Demo", email: "admin@copiloto.demo", passwordHash, role: "ADMIN" },
  });
  const gerente = await prisma.user.create({
    data: { name: "Fernanda Gerente", email: "gerente@copiloto.demo", passwordHash, role: "GERENTE" },
  });

  const team = await prisma.team.create({ data: { name: "Equipe Norte", managerId: gerente.id } });

  const vendors = [];
  for (const v of VENDORS) {
    const user = await prisma.user.create({
      data: { name: v.name, email: v.email, passwordHash, role: "VENDEDOR", teamId: team.id },
    });
    vendors.push(user);
  }

  console.log("Criando clientes...");
  const clients = [];
  let cnpjSeed = 10000000;
  for (const vendor of vendors) {
    const state = pick(states);
    for (let i = 0; i < 14; i++) {
      cnpjSeed++;
      const client = await prisma.client.create({
        data: {
          legalName: `${pick(["Distribuidora", "Comércio", "Loja", "Indústria", "Atacadista"])} ${vendor.name.split(" ")[0]} ${i + 1}`,
          cnpj: randomCnpj(cnpjSeed),
          city: `Cidade ${i + 1}`,
          segment: pick(SEGMENTS),
          classification: pick(["A", "A", "B", "B", "B", "C"]),
          vendorId: vendor.id,
          stateId: pick(states).id,
        },
      });
      clients.push({ ...client, vendorId: vendor.id, behavior: pick(["saudavel", "saudavel", "queda", "risco", "crescimento"]) as
        | "saudavel"
        | "queda"
        | "risco"
        | "crescimento" });
    }
    void state;
  }

  console.log("Gerando histórico de pedidos (26 semanas)...");
  const now = new Date();
  const weeks = 26;

  for (const client of clients) {
    // Frequência histórica de compra: entre 7 e 30 dias
    const baseInterval = randomBetween(7, 30);
    const baseTicket = randomBetween(800, 6000);

    let cursor = new Date(now.getTime() - weeks * 7 * 86400000);
    while (cursor < now) {
      let shouldOrder = true;
      let ticketFactor = 1;

      const daysFromNow = (now.getTime() - cursor.getTime()) / 86400000;
      const isRecentPeriod = daysFromNow < 60; // últimos ~2 meses

      if (client.behavior === "risco" && isRecentPeriod) {
        // Simula cliente que parou de comprar: sem pedidos no período recente
        shouldOrder = Math.random() > 0.85;
      } else if (client.behavior === "queda" && isRecentPeriod) {
        ticketFactor = 0.6;
        shouldOrder = Math.random() > 0.35;
      } else if (client.behavior === "crescimento" && isRecentPeriod) {
        ticketFactor = 1.35;
      }

      if (shouldOrder) {
        const total = Math.max(200, baseTicket * ticketFactor * randomBetween(0.8, 1.2));
        const order = await prisma.order.create({
          data: {
            clientId: client.id,
            vendorId: client.vendorId,
            date: new Date(cursor),
            total,
            discount: total * randomBetween(0, 0.08),
            margin: total * randomBetween(0.12, 0.28),
            freight: total * randomBetween(0.02, 0.06),
          },
        });
        const product = pick(products);
        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            productId: product.id,
            quantity: Math.ceil(randomBetween(1, 8)),
            unitPrice: total / Math.ceil(randomBetween(1, 8)),
          },
        });
      }

      cursor = new Date(cursor.getTime() + baseInterval * 86400000 * randomBetween(0.85, 1.15));
    }
  }

  console.log("Criando metas mensais (mês atual e anterior)...");
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  for (const vendor of vendors) {
    await prisma.goal.create({
      data: { scope: "VENDEDOR", period: "MENSAL", refDate: startOfThisMonth, targetValue: randomBetween(60000, 120000), vendorId: vendor.id },
    });
    await prisma.goal.create({
      data: { scope: "VENDEDOR", period: "MENSAL", refDate: startOfLastMonth, targetValue: randomBetween(60000, 120000), vendorId: vendor.id },
    });
  }

  console.log("Criando algumas tarefas de exemplo...");
  await prisma.task.create({
    data: {
      title: "Ligar para clientes em risco da carteira",
      description: "Priorizar os 5 clientes com maior faturamento médio entre os que estão em risco.",
      priority: "ALTA",
      dueDate: new Date(now.getTime() + 2 * 86400000),
      assigneeId: vendors[0].id,
      creatorId: gerente.id,
    },
  });

  console.log("Seed concluído.");
  console.log("Login de exemplo: admin@copiloto.demo / gerente@copiloto.demo / rafael@copiloto.demo — senha: demo1234");
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
