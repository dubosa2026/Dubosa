import { useState } from "react";
import type { ConfigAlertas } from "../../shared/ipc";

const CAMPOS: Array<{ chave: keyof ConfigAlertas; label: string; sufixo: string }> = [
  { chave: "minutosPresoEmProblema", label: "Avisar quando alguém estiver preso há", sufixo: "min" },
  { chave: "minutosProblemaOperacionalNoDia", label: "Avisar acima de tempo operacional no dia de", sufixo: "min" },
  { chave: "vendedoresParaProblemaColetivo", label: "Tratar como problema coletivo a partir de", sufixo: "vendedores" },
  { chave: "percentConcentracaoArea", label: "Sinalizar área que concentre mais de", sufixo: "%" },
  { chave: "ocorrenciasParaRecorrencia", label: "Considerar recorrência a partir de", sufixo: "chamados" },
];

const FAMILIAS: Array<{ chave: string; label: string }> = [
  { chave: "preso", label: "Vendedor preso em problema" },
  { chave: "tempoEmProblema", label: "Carga operacional alta" },
  { chave: "problemaColetivo", label: "Problema atingindo vários vendedores" },
  { chave: "concentracaoArea", label: "Área concentrando tempo" },
  { chave: "recorrencia", label: "Padrões recorrentes" },
  { chave: "resolvidos", label: "Problemas resolvidos" },
];

/** Alerta que dispara o tempo todo deixa de ser alerta — por isso é configurável. */
export default function ConfigAlertasModal({
  config,
  onFechar,
  onSalvo,
}: {
  config: ConfigAlertas;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [local, setLocal] = useState<ConfigAlertas>(config);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    await window.focoGer.setConfigAlertas(local);
    setSalvando(false);
    onSalvo();
  }

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h3>Configurar alertas</h3>
        <p className="modal-sub">Ajuste os limiares para receber só o que exige sua ação.</p>

        {CAMPOS.map((c) => (
          <div className="campo-linha" key={String(c.chave)}>
            <label htmlFor={`cfg-${String(c.chave)}`}>{c.label}</label>
            <div className="campo-num">
              <input
                id={`cfg-${String(c.chave)}`}
                type="number"
                min={1}
                value={local[c.chave] as number}
                onChange={(e) =>
                  setLocal({ ...local, [c.chave]: Number(e.target.value) || 1 })
                }
              />
              <span>{c.sufixo}</span>
            </div>
          </div>
        ))}

        <fieldset className="campo-check">
          <legend>Famílias de alerta ativas</legend>
          {FAMILIAS.map((f) => (
            <label key={f.chave}>
              <input
                type="checkbox"
                checked={local.ativos[f.chave] ?? true}
                onChange={(e) =>
                  setLocal({ ...local, ativos: { ...local.ativos, [f.chave]: e.target.checked } })
                }
              />
              {f.label}
            </label>
          ))}
        </fieldset>

        <div className="modal-acoes">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primario" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
