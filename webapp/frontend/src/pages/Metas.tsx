import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import type { Goal } from "../lib/types";
import { Card, LoadingState } from "../components/ui";
import { formatCurrency, formatPercent } from "../lib/format";

export function Metas() {
  const { data, isLoading } = useQuery({
    queryKey: ["metas"],
    queryFn: () => apiGet<{ metas: Goal[] }>("/metas"),
  });

  if (isLoading) return <LoadingState />;
  const metas = data?.metas ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Metas</h1>
        <p className="text-sm text-gray-500">Acompanhamento de meta, realizado, gap e projeção.</p>
      </div>

      <div className="space-y-3">
        {metas.map((m) => {
          const pct = Math.min(1, m.percentual ?? 0);
          return (
            <Card key={m.id}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-gray-900">{m.vendor?.name ?? m.scope}</div>
                  <div className="text-xs text-gray-500">
                    {m.scope} · {m.period} · ref. {new Date(m.refDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-800">{formatPercent(m.percentual)}</div>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full ${pct >= 1 ? "bg-success-500" : "bg-brand-500"}`}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-3 text-xs text-gray-600">
                <div>
                  <span className="text-gray-400">Meta: </span>
                  {formatCurrency(m.targetValue)}
                </div>
                <div>
                  <span className="text-gray-400">Realizado: </span>
                  {formatCurrency(m.realizado)}
                </div>
                <div className={m.gap > 0 ? "text-danger-600" : "text-success-600"}>
                  <span className="text-gray-400">Gap: </span>
                  {formatCurrency(m.gap)}
                </div>
              </div>
            </Card>
          );
        })}
        {metas.length === 0 && <div className="text-sm text-gray-500 py-8 text-center">Nenhuma meta cadastrada.</div>}
      </div>
    </div>
  );
}
