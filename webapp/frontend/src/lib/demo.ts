import snapshot from "./demo-snapshot.json";

/**
 * Snapshot de respostas reais da API sobre a base DEMO, gerado por
 * `scripts/gerar-snapshot-demo.mjs`. Carregado sob demanda apenas no build de
 * pré-visualização (VITE_DEMO=1); escritas não são persistidas.
 */
const responses = snapshot as Record<string, unknown>;

export function demoResponse(method: string, path: string, body?: string): unknown {
  const withBody = body ? `${method} ${path} ${body}` : null;
  if (withBody && withBody in responses) return responses[withBody];

  const key = `${method} ${path}`;
  if (key in responses) return responses[key];

  // Escritas sem resposta gravada (registrar contato, criar tarefa, mudar
  // classificação): a pré-visualização aceita a ação mas não persiste nada.
  if (method !== "GET") return { demo: true };

  throw new Error("Esta tela não está disponível na pré-visualização.");
}
