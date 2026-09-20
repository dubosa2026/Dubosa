import { useEffect, useState } from "react";
import type { VendedorStatus } from "../../shared/ipc";
import { STATUS_LABEL } from "../format";

export default function Equipe() {
  const [equipe, setEquipe] = useState<VendedorStatus[] | null>(null);

  useEffect(() => {
    window.focoGer.getEquipe().then((resposta) => {
      if (resposta.ok) setEquipe(resposta.data);
    });
  }, []);

  if (!equipe) return <p className="empty-hint">Carregando equipe...</p>;

  return (
    <div className="panel">
      <h3>Equipe ({equipe.length} vendedores)</h3>
      <ul className="equipe-list">
        {equipe.map((v) => (
          <li key={v.user.id} className="equipe-item">
            <div>
              <div className="equipe-nome">{v.user.nome}</div>
              <div className="equipe-status">{STATUS_LABEL[v.status]}</div>
            </div>
            <div className="equipe-metricas">
              <span>Foco hoje: {v.focoComercialPercentHoje}%</span>
              {v.precisaAjuda && <span className="equipe-ajuda">🆘 precisa de ajuda</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
