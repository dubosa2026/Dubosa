import type { Problema } from "../../shared/ipc";
import { STATUS_LABEL, formatHora, statusEncerrado } from "../format";

export default function HistoricoChamados({
  chamados,
  onAtualizar,
}: {
  chamados: Problema[];
  onAtualizar: () => void;
}) {
  const abertos = chamados.filter((p) => !statusEncerrado(p.status));

  async function resolver(problemaId: string) {
    await window.foco.moverProblema(problemaId, "RESOLVIDO", "resolvido pelo vendedor");
    onAtualizar();
  }

  return (
    <section className="painel">
      <div className="painel-cabeca">
        <h2>Seus chamados</h2>
        {chamados.length > 0 && <span className="rotulo">{abertos.length} em aberto</span>}
      </div>

      {chamados.length === 0 && (
        <p className="vazio">
          Nenhum chamado registrado. Quando um problema operacional aparecer, registre aqui — é assim
          que ele vira algo que seu gerente pode remover.
        </p>
      )}

      <ul className="chamados">
        {chamados.map((p) => (
          <li
            key={p.id}
            className="chamado"
            style={{ borderLeftColor: statusEncerrado(p.status) ? "var(--verde)" : "var(--ambar)" }}
          >
            <div className="chamado-topo">
              <span className="protocolo">{p.protocolo}</span>
              <span className={`chip ${statusEncerrado(p.status) ? "chip-ok" : "chip-aberto"}`}>
                {STATUS_LABEL[p.status]}
              </span>
            </div>
            {p.cliente && <div className="chamado-cliente">{p.cliente}</div>}
            <div className="chamado-desc">{p.descricao}</div>
            <div className="chamado-meta">
              <span>{p.areaResponsavel}</span>
              <span>prioridade {p.prioridade.toLowerCase()}</span>
              <span>aberto às {formatHora(p.criadoEm)}</span>
              {p.responsavel && <span>com {p.responsavel}</span>}
              {p.preso && <span className="preso">🆘 ajuda solicitada</span>}
            </div>
            {!statusEncerrado(p.status) && (
              <button className="btn-mini" onClick={() => resolver(p.id)}>
                Marcar como resolvido
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
