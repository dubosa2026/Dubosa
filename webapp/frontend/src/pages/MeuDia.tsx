import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api";
import type { MeuDiaResponse } from "../lib/types";
import { Card, EmptyState, LoadingState, alertStyles } from "../components/ui";
import { formatCurrency, formatDate } from "../lib/format";

export function MeuDia() {
  const { data, isLoading } = useQuery({
    queryKey: ["meu-dia"],
    queryFn: () => apiGet<MeuDiaResponse>("/meu-dia"),
  });

  if (isLoading || !data) return <LoadingState />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Meu Dia</h1>
        <p className="text-sm text-gray-500">O que precisa da sua atenção agora, organizado pela IA.</p>
      </div>

      <Section title="🔴 Prioridade alta" items={data.prioridadeAlta} empty="Nenhuma prioridade alta no momento." />
      <Section title="🟡 Acompanhar" items={data.acompanhar} empty="Nada para acompanhar além do dia a dia." />

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">🟢 Oportunidades</h2>
        {data.oportunidades.length === 0 ? (
          <EmptyState message="Nenhuma oportunidade de reativação identificada." />
        ) : (
          <div className="space-y-2">
            {data.oportunidades.slice(0, 6).map((op) => (
              <Card key={op.clientId} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{op.legalName}</div>
                  <div className="text-xs text-gray-500">{op.motivo}</div>
                </div>
                <div className="text-sm font-semibold text-gray-700">{formatCurrency(op.faturamentoMedioMensal)}/mês</div>
              </Card>
            ))}
            <Link to="/reativacao" className="text-xs text-brand-600 hover:underline">
              Ver central de reativação completa →
            </Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">📅 Tarefas de hoje</h2>
        {data.tarefasHoje.length === 0 ? (
          <EmptyState message="Nenhuma tarefa pendente." />
        ) : (
          <div className="space-y-2">
            {data.tarefasHoje.map((t) => (
              <Card key={t.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{t.title}</div>
                  <div className="text-xs text-gray-500">
                    {t.client ? `${t.client.legalName} · ` : ""}
                    {t.dueDate ? `prazo ${formatDate(t.dueDate)}` : "sem prazo"}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    t.status === "ATRASADA" ? "bg-danger-50 text-danger-600" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {t.status}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Section({
  title,
  items,
  empty,
}: {
  title: string;
  items: { title: string; message: string; level: string }[];
  empty: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h2>
      {items.length === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <div className="space-y-2">
          {items.map((a, i) => {
            const style = alertStyles(a.level);
            return (
              <Card key={i} className={`border-l-4 ${style.border} ${style.bg}`}>
                <div className="font-medium text-gray-900">{a.title}</div>
                <div className="text-sm text-gray-700">{a.message}</div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
