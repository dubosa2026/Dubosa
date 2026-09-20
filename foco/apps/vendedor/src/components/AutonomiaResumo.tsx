import { useEffect, useState } from "react";
import type { AutonomiaData } from "../../shared/ipc";

export default function AutonomiaResumo() {
  const [dados, setDados] = useState<AutonomiaData | null>(null);

  useEffect(() => {
    window.foco.getAutonomia().then((resposta) => {
      if (resposta.ok) setDados(resposta.data);
    });
  }, []);

  if (!dados) return null;

  return (
    <div className="panel">
      <h3>Autonomia dos seus clientes</h3>
      <p className="autonomia-geral">
        <strong>{dados.geral.percentAutonomia}%</strong> das cotações/pedidos foram feitos pelos próprios
        integradores ({dados.geral.acoesIntegrador}/{dados.geral.totalAcoes})
      </p>
      <ul className="autonomia-list">
        {dados.porCliente.map((c) => (
          <li key={c.cliente} className={c.baixaAutonomia ? "autonomia-baixa" : ""}>
            <div className="autonomia-cliente-topo">
              <span>{c.baixaAutonomia ? "🔴" : "🟢"} {c.cliente}</span>
              <span>{c.percentAutonomia}%</span>
            </div>
            {c.baixaAutonomia && c.sugestaoAbordagem && (
              <p className="autonomia-sugestao">"{c.sugestaoAbordagem}"</p>
            )}
          </li>
        ))}
        {dados.porCliente.length === 0 && <p className="empty-hint">Nenhuma ação registrada ainda.</p>}
      </ul>
    </div>
  );
}
