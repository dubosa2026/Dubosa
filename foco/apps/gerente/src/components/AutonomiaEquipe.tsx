import { useEffect, useState } from "react";
import type { AutonomiaEquipeData } from "../../shared/ipc";

export default function AutonomiaEquipe() {
  const [dados, setDados] = useState<AutonomiaEquipeData | null>(null);

  useEffect(() => {
    window.focoGer.getAutonomia().then((resposta) => {
      if (resposta.ok) setDados(resposta.data);
    });
  }, []);

  if (!dados) return <p className="empty-hint">Carregando...</p>;

  return (
    <div>
      <section className="panel">
        <h3>Autonomia dos integradores</h3>
        <p className="autonomia-geral">
          <strong>{dados.geral.percentAutonomia}%</strong> das cotações/pedidos foram feitos pelos próprios
          integradores ({dados.geral.acoesIntegrador}/{dados.geral.totalAcoes})
        </p>
        <ul className="evolucao-list">
          {dados.evolucaoSemanal.map((e) => (
            <li key={e.semana}>
              <span>{e.semana}</span>
              <div className="mapa-barra-bg">
                <div className="mapa-barra-fill mapa-barra-verde" style={{ width: `${e.percentAutonomia}%` }} />
              </div>
              <span>{e.percentAutonomia}%</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>Clientes com baixa autonomia digital</h3>
        <ul className="autonomia-list">
          {dados.porCliente
            .filter((c) => c.baixaAutonomia)
            .map((c) => (
              <li key={c.cliente} className="autonomia-baixa">
                <div className="autonomia-cliente-topo">
                  <span>🔴 {c.cliente}</span>
                  <span>{c.percentAutonomia}%</span>
                </div>
              </li>
            ))}
          {dados.porCliente.every((c) => !c.baixaAutonomia) && (
            <p className="empty-hint">Nenhum cliente com baixa autonomia identificado.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
