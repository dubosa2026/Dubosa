import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api";
import type { ClientListItem } from "../lib/types";
import { Card, HealthBadge, LoadingState } from "../components/ui";
import { formatCurrency } from "../lib/format";

export function Clientes() {
  const { data, isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => apiGet<{ clientes: ClientListItem[] }>("/clientes"),
  });
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("TODAS");

  const clientes = data?.clientes ?? [];

  const filtered = useMemo(() => {
    return clientes.filter((c) => {
      const matchesSearch = c.legalName.toLowerCase().includes(search.toLowerCase());
      const matchesClass = classFilter === "TODAS" || c.classification === classFilter;
      return matchesSearch && matchesClass;
    });
  }, [clientes, search, classFilter]);

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500">{clientes.length} clientes na sua base.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="TODAS">Todas as classes</option>
          <option value="A">Classe A</option>
          <option value="B">Classe B</option>
          <option value="C">Classe C</option>
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map((c) => (
          <Link key={c.id} to={`/clientes/${c.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{c.legalName}</div>
                  <div className="text-xs text-gray-500">
                    {c.city}
                    {c.uf ? `/${c.uf}` : ""} · {c.segment} · vendedor {c.vendor.name} · classe {c.classification}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-gray-800">{formatCurrency(c.totalRevenue)}</div>
                  <HealthBadge status={c.health.status} />
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && <div className="text-sm text-gray-500 py-8 text-center">Nenhum cliente encontrado.</div>}
      </div>
    </div>
  );
}
