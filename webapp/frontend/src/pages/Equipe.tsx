import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api";
import type { VendorPerformance } from "../lib/types";
import { Card, LoadingState } from "../components/ui";
import { formatCurrency, formatPercent } from "../lib/format";

const TREND_LABEL: Record<string, string> = {
  CRESCIMENTO: "📈 Crescendo",
  QUEDA: "📉 Em queda",
  ESTAVEL: "➡️ Estável",
};

export function Equipe() {
  const { data, isLoading } = useQuery({
    queryKey: ["vendedores"],
    queryFn: () => apiGet<{ vendedores: VendorPerformance[] }>("/vendedores"),
  });

  if (isLoading) return <LoadingState />;
  const vendedores = data?.vendedores ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Equipe</h1>
        <p className="text-sm text-gray-500">Desempenho individual de cada vendedor no mês.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {vendedores.map((v) => (
          <Link key={v.vendorId} to={`/equipe/${v.vendorId}`}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-gray-900">{v.name}</div>
                <span className="text-xs font-medium text-gray-500">{TREND_LABEL[v.trend]}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Faturamento" value={formatCurrency(v.revenue)} />
                <Metric label="% da meta" value={formatPercent(v.pctGoal)} />
                <Metric label="Pedidos" value={String(v.orders)} />
                <Metric label="Ticket médio" value={formatCurrency(v.avgTicket)} />
                <Metric label="Clientes em risco" value={String(v.clientesEmRisco ?? 0)} danger={(v.clientesEmRisco ?? 0) > 0} />
                <Metric
                  label="Vs. mês anterior"
                  value={v.variacaoPercentual !== null ? formatPercent(v.variacaoPercentual) : "—"}
                  danger={v.variacaoPercentual !== null && v.variacaoPercentual < 0}
                />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-gray-400 font-medium">{label}</div>
      <div className={`font-semibold ${danger ? "text-danger-600" : "text-gray-800"}`}>{value}</div>
    </div>
  );
}
