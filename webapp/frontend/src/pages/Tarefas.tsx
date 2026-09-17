import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../lib/api";
import type { Task } from "../lib/types";
import { Card, LoadingState } from "../components/ui";
import { formatDate } from "../lib/format";

const STATUS_LABEL: Record<Task["status"], string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  ATRASADA: "Atrasada",
};

const PRIORITY_STYLE: Record<Task["priority"], string> = {
  ALTA: "bg-danger-50 text-danger-600",
  MEDIA: "bg-warning-50 text-warning-600",
  BAIXA: "bg-gray-100 text-gray-600",
};

export function Tarefas() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tarefas"],
    queryFn: () => apiGet<{ tarefas: Task[] }>("/tarefas"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task["status"] }) => apiPatch(`/tarefas/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tarefas"] }),
  });

  if (isLoading) return <LoadingState />;
  const tarefas = data?.tarefas ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Plano de Ação</h1>
        <p className="text-sm text-gray-500">Tarefas gerenciais, criadas manualmente ou a partir de alertas da IA.</p>
      </div>

      <div className="space-y-2">
        {tarefas.map((t) => (
          <Card key={t.id} className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-gray-900">{t.title}</div>
              {t.description && <div className="text-sm text-gray-600 mt-0.5">{t.description}</div>}
              <div className="text-xs text-gray-500 mt-1">
                {t.assignee && `${t.assignee.name} · `}
                {t.client && `${t.client.legalName} · `}
                {t.dueDate ? `prazo ${formatDate(t.dueDate)}` : "sem prazo"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
              <select
                value={t.status}
                onChange={(e) => statusMutation.mutate({ id: t.id, status: e.target.value as Task["status"] })}
                className="text-xs rounded-lg border border-gray-300 px-2 py-1"
              >
                {(Object.keys(STATUS_LABEL) as Task["status"][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </Card>
        ))}
        {tarefas.length === 0 && <div className="text-sm text-gray-500 py-8 text-center">Nenhuma tarefa cadastrada.</div>}
      </div>
    </div>
  );
}
