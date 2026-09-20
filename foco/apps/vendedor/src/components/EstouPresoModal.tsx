import { useState } from "react";
import type { Problema } from "../../shared/ipc";

/**
 * "Estou preso neste problema" — as perguntas rápidas da especificação.
 * Qual problema e qual área já vêm do chamado; o que falta perguntar é se
 * precisa de ajuda agora e o que já foi tentado, para o gerente não chegar
 * cobrando o que o vendedor já fez.
 */
export default function EstouPresoModal({
  problema,
  onFechar,
  onEnviado,
}: {
  problema: Problema;
  onFechar: () => void;
  onEnviado: () => void;
}) {
  const [precisaAgora, setPrecisaAgora] = useState(true);
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    await window.foco.estouPreso({ problemaId: problema.id, precisaAgora, observacao });
    setEnviando(false);
    onEnviado();
  }

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h3>🆘 Estou preso neste problema</h3>
        <p className="modal-sub">
          Isso avisa seu gerente na hora. O objetivo é tirar isso das suas costas, não registrar
          falha sua.
        </p>

        <div className="leitura">
          <div className="leitura-linha">
            <span>Problema</span>
            <b>{problema.protocolo}</b>
          </div>
          <div className="leitura-linha">
            <span>Cliente</span>
            <b>{problema.cliente ?? "—"}</b>
          </div>
          <div className="leitura-linha">
            <span>Área responsável</span>
            <b>{problema.areaResponsavel}</b>
          </div>
        </div>

        <fieldset className="campo-radio">
          <legend>Precisa de ajuda agora?</legend>
          <label>
            <input
              type="radio"
              name="precisa-agora"
              checked={precisaAgora}
              onChange={() => setPrecisaAgora(true)}
            />
            Sim, estou travado e o cliente está esperando
          </label>
          <label>
            <input
              type="radio"
              name="precisa-agora"
              checked={!precisaAgora}
              onChange={() => setPrecisaAgora(false)}
            />
            Não é urgente, mas está consumindo meu tempo
          </label>
        </fieldset>

        <div className="campo">
          <label htmlFor="preso-obs">O que você já tentou? (opcional)</label>
          <textarea
            id="preso-obs"
            rows={3}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: já falei com a área duas vezes e não tive retorno."
          />
        </div>

        <div className="modal-acoes">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-sos-solido" disabled={enviando} onClick={enviar}>
            {enviando ? "Enviando..." : "Pedir ajuda"}
          </button>
        </div>
      </div>
    </div>
  );
}
