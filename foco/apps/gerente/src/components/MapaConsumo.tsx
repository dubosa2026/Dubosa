import { useEffect, useState } from "react";
import type { ConsumoPorArea } from "../../shared/ipc";

export default function MapaConsumo() {
  const [mapa, setMapa] = useState<ConsumoPorArea[] | null>(null);

  useEffect(() => {
    window.focoGer.getMapaConsumo().then((resposta) => {
      if (resposta.ok) setMapa(resposta.data);
    });
  }, []);

  if (!mapa) return <p className="empty-hint">Carregando...</p>;

  return (
    <div className="panel">
      <h3>Mapa de consumo do tempo</h3>
      <p className="modal-hint">Para onde vai o tempo comercial perdido em problemas hoje, por área responsável.</p>
      {mapa.length === 0 && <p className="empty-hint">Nenhum tempo em problemas registrado hoje.</p>}
      <ul className="mapa-list">
        {mapa.map((m) => (
          <li key={m.area}>
            <div className="mapa-topo">
              <span>{m.area}</span>
              <span>{m.percent}%</span>
            </div>
            <div className="mapa-barra-bg">
              <div className="mapa-barra-fill" style={{ width: `${m.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
