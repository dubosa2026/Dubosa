import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api";
import type { DashboardResponse } from "../lib/types";
import { formatCurrency, formatPercent } from "../lib/format";
import { Card, KpiCard, LoadingState } from "../components/ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardResponse>("/dashboard"),
  });

  if (isLoading || !data) return <LoadingState />;

  const { summary, vendedores, saudeCarteira } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Bom dia, {data.greetingName.split(" ")[0]}.</h1>
        <p className="text-sm text-gray-500">Aqui está o seu radar comercial.</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Resultado</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Faturamento atual" value={formatCurrency(summary.resultado.faturamentoAtual)} />
          <KpiCard
            label="% da meta"
            value={formatPercent(summary.resultado.percentualAtingido)}
            sub={`Meta: ${formatCurrency(summary.resultado.meta)}`}
          />
          <KpiCard
            label="Gap para meta"
            value={formatCurrency(summary.resultado.gap)}
            tone={summary.resultado.gap > 0 ? "danger" : "success"}
          />
          <KpiCard
            label="Projeção fim do mês"
            value={formatCurrency(summary.resultado.projecaoFimPeriodo)}
            sub={
              summary.resultado.variacaoPercentual !== null
                ? `${summary.resultado.variacaoPercentual >= 0 ? "+" : ""}${formatPercent(summary.resultado.variacaoPercentual)} vs período anterior`
                : undefined
            }
            tone={
              summary.resultado.variacaoPercentual === null
                ? "neutral"
                : summary.resultado.variacaoPercentual >= 0
                  ? "success"
                  : "danger"
            }
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Pedidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiCard label="Pedidos no mês" value={String(summary.pedidos.total)} />
          <KpiCard label="Média diária" value={summary.pedidos.mediaDiaria.toFixed(1)} />
          <KpiCard label="Ticket médio" value={formatCurrency(summary.pedidos.ticketMedio)} />
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Clientes</h2>
          <div className="grid grid-cols-2 gap-4">
            <KpiCard label="Ativos" value={String(summary.clientes.ativos)} />
            <KpiCard label="Novos" value={String(summary.clientes.novos)} />
            <KpiCard label="Inativos" value={String(summary.clientes.inativos)} />
            <KpiCard
              label="Em risco"
              value={String(summary.clientes.emRisco)}
              tone={summary.clientes.emRisco > 0 ? "danger" : "success"}
            />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Equipe</h2>
          <div className="grid grid-cols-2 gap-4">
            <KpiCard label="Acima da meta" value={String(summary.equipe.acimaDaMeta)} tone="success" />
            <KpiCard label="Abaixo da meta" value={String(summary.equipe.abaixoDaMeta)} tone="danger" />
            <KpiCard label="Em crescimento" value={String(summary.equipe.tendenciaCrescimento)} tone="success" />
            <KpiCard label="Em queda" value={String(summary.equipe.tendenciaQueda)} tone="danger" />
          </div>
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Desempenho por vendedor</h2>
          <Link to="/equipe" className="text-xs text-brand-600 hover:underline">
            Ver equipe completa →
          </Link>
        </div>
        <Card>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={vendedores}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.split(" ")[0]} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="revenue" name="Faturamento" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              <Bar dataKey="goal" name="Meta" fill="#e0e7ff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Saúde da carteira</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="🟢 Saudável" value={String(saudeCarteira.saudavel)} />
          <KpiCard label="🟡 Atenção" value={String(saudeCarteira.atencao)} />
          <KpiCard label="🟠 Risco" value={String(saudeCarteira.risco)} tone="danger" />
          <KpiCard label="🔴 Alto risco" value={String(saudeCarteira.altoRisco)} tone="danger" />
        </div>
      </section>
    </div>
  );
}
