import { writeFileSync } from "node:fs";

const BASE = "http://localhost:4000/api";
const snapshot = {};
let token = null;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}

async function capture(method, path, body) {
  const data = await call(method, path, body);
  const key = `${method} ${path}${body ? ` ${JSON.stringify(body)}` : ""}`;
  snapshot[key] = data;
  return data;
}

const login = await call("POST", "/auth/login", {
  email: "gerente@copiloto.demo",
  password: "demo1234",
});
token = login.token;
snapshot["POST /auth/login"] = { token: "demo-preview-token", user: login.user };
snapshot["GET /auth/me"] = { user: login.user };

const dashboard = await capture("GET", "/dashboard");
await capture("GET", "/radar");
await capture("GET", "/meu-dia");
await capture("GET", "/vendedores");
await capture("GET", "/metas");
await capture("GET", "/tarefas");
const reativacao = await capture("GET", "/reativacao");
const clientes = await capture("GET", "/clientes");

for (const v of dashboard.vendedores) {
  await capture("GET", `/vendedores/${v.vendorId}`);
  await capture("POST", `/vendedores/${v.vendorId}/analise-ia`);
}

for (const c of clientes.clientes) {
  await capture("GET", `/clientes/${c.id}`);
}

for (const item of reativacao.lista) {
  await capture("POST", `/reativacao/${item.clientId}/estrategia-ia`);
}

const perguntas = [
  "Quanto vendemos este mês?",
  "Quais vendedores precisam de atenção?",
  "Quais clientes devo priorizar hoje?",
  "Quais clientes estão em risco?",
  "Quem cresceu mais?",
  "Qual estado está puxando o resultado?",
  "Mostre os clientes que pararam de comprar.",
  "Crie um plano para recuperar R$ 2 milhões",
];
for (const question of perguntas) {
  await capture("POST", "/ia/perguntar", { question });
}

const out = "/home/user/Dubosa/webapp/frontend/src/lib/demo-snapshot.json";
writeFileSync(out, JSON.stringify(snapshot, null, 0));
console.log("Chaves capturadas:", Object.keys(snapshot).length);
console.log("Tamanho:", (JSON.stringify(snapshot).length / 1024 / 1024).toFixed(2), "MB");
