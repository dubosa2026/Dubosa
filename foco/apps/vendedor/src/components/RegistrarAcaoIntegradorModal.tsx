import { useState } from "react";
import type { IntegratorActionType } from "../../shared/ipc";

const TIPOS: Array<{ valor: IntegratorActionType; label: string }> = [
  { valor: "COTACAO", label: "Cotação" },
  { valor: "PEDIDO", label: "Pedido" },
  { valor: "CONSULTA_PRECO", label: "Consulta de preço" },
  { valor: "CONSULTA_ESTOQUE", label: "Consulta de estoque" },
  { valor: "CONSULTA_FRETE", label: "Consulta de frete" },
];

export default function RegistrarAcaoIntegradorModal({
  onClose,
  onRegistrado,
}: {
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState<IntegratorActionType>("COTACAO");
  const [origem, setOrigem] = useState<"INTEGRADOR" | "VENDEDOR">("INTEGRADOR");
  const [enviando, setEnviando] = useState(false);

  async function handleSalvar() {
    setEnviando(true);
    await window.foco.registerIntegratorAction({ cliente, tipo, origem });
    setEnviando(false);
    onRegistrado();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📋 Registrar cotação / pedido</h2>
        <p className="modal-hint">
          Use isto para acompanhar quem fez a ação: o integrador sozinho (autonomia) ou você (operacional).
        </p>
        <label>
          Cliente
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" />
        </label>
        <label>
          Tipo de ação
          <select value={tipo} onChange={(e) => setTipo(e.target.value as IntegratorActionType)}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quem fez
          <select value={origem} onChange={(e) => setOrigem(e.target.value as "INTEGRADOR" | "VENDEDOR")}>
            <option value="INTEGRADOR">O próprio integrador (autonomia)</option>
            <option value="VENDEDOR">Eu fiz pelo cliente (operacional)</option>
          </select>
        </label>
        <div className="modal-actions">
          <button className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!cliente || enviando} onClick={handleSalvar}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
