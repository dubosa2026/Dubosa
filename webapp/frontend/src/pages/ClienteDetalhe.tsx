import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { Card, Button, HealthBadge, LoadingState } from "../components/ui";
import { formatCurrency, formatDate } from "../lib/format";

interface ClientDetail {
  id: string;
  legalName: string;
  cnpj: string;
  city: string;
  segment: string;
  classification: "A" | "B" | "C";
  vendor: { id: string; name: string };
  state: { uf: string } | null;
  totalRevenue: number;
  avgTicket: number;
  health: { status: string; score: number; daysSinceLastOrder: number | null; reasons: string[] };
  orders: { id: string; date: string; total: string | number }[];
  interactions: { id: string; type: string; notes: string; createdAt: string; user: { name: string } }[];
}

export function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [type, setType] = useState("LIGACAO");

  const { data, isLoading } = useQuery({
    queryKey: ["cliente", id],
    queryFn: () => apiGet<ClientDetail>(`/clientes/${id}`),
    enabled: !!id,
  });

  const classificationMutation = useMutation({
    mutationFn: (classification: string) => apiPatch(`/clientes/${id}/classificacao`, { classification }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cliente", id] }),
  });

  const interactionMutation = useMutation({
    mutationFn: () => apiPost(`/clientes/${id}/interacoes`, { type, notes: note }),
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["cliente", id] });
    },
  });

  if (isLoading || !data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <Link to="/clientes" className="text-xs text-brand-600 hover:underline">
        ← Voltar para clientes
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{data.legalName}</h1>
          <p className="text-sm text-gray-500">
            {data.cnpj} · {data.city}
            {data.state ? `/${data.state.uf}` : ""} · {data.segment} · vendedor {data.vendor.name}
          </p>
        </div>
        <HealthBadge status={data.health.status} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-xs text-gray-500">Faturamento total</div>
          <div className="text-lg font-bold">{formatCurrency(data.totalRevenue)}</div>
        </Card>
        <Card>
          <div className="text-xs text-gray-500">Ticket médio</div>
          <div className="text-lg font-bold">{formatCurrency(data.avgTicket)}</div>
        </Card>
        <Card>
          <div className="text-xs text-gray-500">Dias sem comprar</div>
          <div className="text-lg font-bold">{data.health.daysSinceLastOrder ?? "—"}</div>
        </Card>
        <Card>
          <div className="text-xs text-gray-500 mb-1">Classificação</div>
          <div className="flex gap-1">
            {["A", "B", "C"].map((cl) => (
              <button
                key={cl}
                onClick={() => classificationMutation.mutate(cl)}
                className={`text-xs font-semibold w-7 h-7 rounded-full border ${
                  data.classification === cl
                    ? "bg-brand-600 text-white border-brand-600"
                    : "border-gray-300 text-gray-500 hover:border-brand-400"
                }`}
              >
                {cl}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="text-sm font-semibold text-gray-700 mb-2">Por que este status de saúde?</div>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          {data.health.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Histórico de pedidos</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {data.orders.map((o) => (
              <Card key={o.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-600">{formatDate(o.date)}</span>
                <span className="text-sm font-semibold">{formatCurrency(Number(o.total))}</span>
              </Card>
            ))}
            {data.orders.length === 0 && <div className="text-sm text-gray-500">Sem pedidos registrados.</div>}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Interações</h2>
          <div className="space-y-2 mb-3">
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="LIGACAO">Ligação</option>
              <option value="VISITA">Visita</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">E-mail</option>
              <option value="OUTRO">Outro</option>
            </select>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Registrar contato..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={2}
            />
            <Button onClick={() => note.trim() && interactionMutation.mutate()} disabled={!note.trim() || interactionMutation.isPending}>
              Registrar contato
            </Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {data.interactions.map((i) => (
              <Card key={i.id} className="py-2.5">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>
                    {i.type} · {i.user.name}
                  </span>
                  <span>{formatDate(i.createdAt)}</span>
                </div>
                <div className="text-sm text-gray-700">{i.notes}</div>
              </Card>
            ))}
            {data.interactions.length === 0 && <div className="text-sm text-gray-500">Nenhuma interação registrada.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
