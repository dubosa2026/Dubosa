import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import type { RadarAlert } from "../lib/types";
import { Card, EmptyState, LoadingState, alertStyles } from "../components/ui";

export function RadarIA() {
  const { data, isLoading } = useQuery({
    queryKey: ["radar"],
    queryFn: () => apiGet<{ alerts: RadarAlert[] }>("/radar"),
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <LoadingState />;
  const alerts = data?.alerts ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Radar IA</h1>
        <p className="text-sm text-gray-500">
          A IA analisou os dados disponíveis e destacou o que merece sua atenção agora.
        </p>
      </div>

      {alerts.length === 0 && <EmptyState message="Nenhum alerta identificado com os dados atuais." />}

      <div className="space-y-3">
        {alerts.map((alert) => {
          const style = alertStyles(alert.level);
          const isOpen = expanded === alert.id;
          return (
            <Card key={alert.id} className={`border-l-4 ${style.border} ${style.bg}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">
                    {style.emoji} {style.label}
                  </div>
                  <div className="font-semibold text-gray-900">{alert.title}</div>
                  <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
                </div>
                <button
                  onClick={() => setExpanded(isOpen ? null : alert.id)}
                  className="shrink-0 text-xs font-medium text-brand-600 hover:underline whitespace-nowrap"
                >
                  {isOpen ? "Ocultar" : "Ver detalhes"}
                </button>
              </div>

              {isOpen && (
                <div className="mt-4 pt-4 border-t border-gray-200/70">
                  <div className="text-xs font-semibold text-gray-500 mb-2">Por que estou vendo este alerta?</div>
                  <pre className="text-xs bg-white/70 rounded-lg p-3 overflow-x-auto text-gray-700">
                    {JSON.stringify(alert.evidence, null, 2)}
                  </pre>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
