import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";
import type { ReactivationItem } from "../lib/types";
import { Card, Button, EmptyState, LoadingState } from "../components/ui";
import { formatCurrency } from "../lib/format";

export function Reativacao() {
  const { data, isLoading } = useQuery({
    queryKey: ["reativacao"],
    queryFn: () => apiGet<{ lista: ReactivationItem[] }>("/reativacao"),
  });
  const [strategies, setStrategies] = useState<Record<string, string[]>>({});

  const strategyMutation = useMutation({
    mutationFn: (clientId: string) => apiPost<{ passos: string[] }>(`/reativacao/${clientId}/estrategia-ia`),
    onSuccess: (res, clientId) => setStrategies((s) => ({ ...s, [clientId]: res.passos })),
  });

  const taskMutation = useMutation({
    mutationFn: (item: ReactivationItem) =>
      apiPost("/tarefas", {
        title: `Reativar cliente ${item.legalName}`,
        description: item.motivo,
        priority: "ALTA",
        assigneeId: item.vendorId,
        clientId: item.clientId,
      }),
  });

  if (isLoading) return <LoadingState />;
  const lista = data?.lista ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Central de Reativação</h1>
        <p className="text-sm text-gray-500">Lista priorizada de clientes com maior potencial de recuperação.</p>
      </div>

      {lista.length === 0 && <EmptyState message="Nenhum cliente prioritário para reativação no momento." />}

      <div className="space-y-3">
        {lista.map((item) => (
          <Card key={item.clientId}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">{item.legalName}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Faturamento médio: {formatCurrency(item.faturamentoMedioMensal)} · Última compra:{" "}
                  {item.diasSemComprar} dias · Frequência histórica: {item.frequenciaHistoricaDias?.toFixed(0)} dias
                  {item.quedaPercentual !== null && ` · Queda: ${item.quedaPercentual}%`}
                </div>
                <div className="text-sm text-gray-700 mt-2">
                  <span className="font-medium">Motivo da prioridade: </span>
                  {item.motivo}
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Link to={`/clientes/${item.clientId}`}>
                  <Button variant="secondary" className="w-full">
                    Abrir cliente
                  </Button>
                </Link>
                <Button variant="secondary" onClick={() => taskMutation.mutate(item)} disabled={taskMutation.isPending}>
                  Criar tarefa
                </Button>
                <Button onClick={() => strategyMutation.mutate(item.clientId)} disabled={strategyMutation.isPending}>
                  Gerar estratégia IA
                </Button>
              </div>
            </div>

            {strategies[item.clientId] && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-500 mb-2">Estratégia sugerida</div>
                <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                  {strategies[item.clientId].map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
