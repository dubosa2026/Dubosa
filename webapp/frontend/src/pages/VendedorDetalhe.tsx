import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";
import { Card, Button, HealthBadge, LoadingState } from "../components/ui";
import { formatCurrency, formatPercent } from "../lib/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import type { VendorPerformance } from "../lib/types";

interface VendorDetail {
  vendor: { id: string; name: string; email: string };
  desempenho: VendorPerformance | null;
  evolucaoSemanal: { weekStart: string; revenue: number; orders: number }[];
  carteira: {
    id: string;
    legalName: string;
    classification: string;
    health: { status: string; score: number; daysSinceLastOrder: number | null } | null;
  }[];
}

interface VendorAnalysis {
  pontosDeAtencao: string[];
  oportunidades: string[];
  prioridades: string[];
}

export function VendedorDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<VendorAnalysis | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["vendedor", id],
    queryFn: () => apiGet<VendorDetail>(`/vendedores/${id}`),
    enabled: !!id,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => apiPost<VendorAnalysis>(`/vendedores/${id}/analise-ia`),
    onSuccess: (res) => setAnalysis(res),
  });

  if (isLoading || !data) return <LoadingState />;
  const d = data.desempenho;

  return (
    <div className="space-y-6">
      <Link to="/equipe" className="text-xs text-brand-600 hover:underline">
        ← Voltar para equipe
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{data.vendor.name}</h1>
          <p className="text-sm text-gray-500">{data.vendor.email}</p>
        </div>
        <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>
          {analyzeMutation.isPending ? "Analisando..." : "🤖 Analise este vendedor"}
        </Button>
      </div>

      {d && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <div className="text-xs text-gray-500">Faturamento</div>
            <div className="text-lg font-bold">{formatCurrency(d.revenue)}</div>
          </Card>
          <Card>
            <div className="text-xs text-gray-500">% da meta</div>
            <div className="text-lg font-bold">{formatPercent(d.pctGoal)}</div>
          </Card>
          <Card>
            <div className="text-xs text-gray-500">Ticket médio</div>
            <div className="text-lg font-bold">{formatCurrency(d.avgTicket)}</div>
          </Card>
          <Card>
            <div className="text-xs text-gray-500">Pedidos</div>
            <div className="text-lg font-bold">{d.orders}</div>
          </Card>
        </div>
      )}

      <Card>
        <div className="text-sm font-semibold text-gray-700 mb-3">Evolução semanal (últimas 8 semanas)</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.evolucaoSemanal}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {analysis && (
        <Card className="border-l-4 border-brand-500 bg-brand-50">
          <div className="text-sm font-semibold text-brand-700 mb-3">Análise da IA</div>
          <AnalysisBlock title="Pontos de atenção" items={analysis.pontosDeAtencao} />
          <AnalysisBlock title="Oportunidades" items={analysis.oportunidades} />
          <AnalysisBlock title="Prioridades" items={analysis.prioridades} />
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Carteira</h2>
        <div className="space-y-2">
          {data.carteira.map((c) => (
            <Card key={c.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{c.legalName}</div>
                <div className="text-xs text-gray-500">Classe {c.classification}</div>
              </div>
              {c.health && <HealthBadge status={c.health.status} />}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalysisBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-xs font-semibold text-gray-600 mb-1">{title}</div>
      <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
