import type { Problema, RegistroTempo } from "../../shared/ipc";
import { CATEGORIA_COR, CATEGORIA_LABEL, formatDuracao, formatHora } from "../format";

/**
 * O histórico do próprio cronômetro, na ordem em que aconteceu. O vendedor
 * precisa conseguir ver e conferir o que declarou — é dele, e é a única
 * forma de o registro ser honesto.
 */
export default function LinhaDoDia({
  registros,
  chamados,
}: {
  registros: RegistroTempo[];
  chamados: Problema[];
}) {
  const ordenados = registros.slice().sort((a, b) => a.inicio.localeCompare(b.inicio));

  return (
    <section className="painel">
      <div className="painel-cabeca">
        <h2>Seu dia, bloco a bloco</h2>
        <span className="selo selo-declarado">tempo declarado</span>
      </div>

      {ordenados.length === 0 && <p className="vazio">Nenhum bloco registrado hoje.</p>}

      <ul className="linha-dia">
        {ordenados.map((r) => {
          const segundos = Math.max(
            0,
            Math.round(
              ((r.fim ? new Date(r.fim).getTime() : Date.now()) - new Date(r.inicio).getTime()) / 1000
            )
          );
          const problema = r.problemaId ? chamados.find((p) => p.id === r.problemaId) : null;
          return (
            <li key={r.id}>
              <span className="linha-hora">{formatHora(r.inicio)}</span>
              <span className="ponto" style={{ background: CATEGORIA_COR[r.categoria] }} />
              <span className="linha-cat">
                {CATEGORIA_LABEL[r.categoria]}
                {problema && <span className="linha-prot"> · {problema.protocolo}</span>}
                {r.alteracoes && r.alteracoes.length > 0 && (
                  <span className="linha-alterado" title="Categoria alterada depois do registro">
                    {" "}· editado
                  </span>
                )}
              </span>
              <span className="linha-dur">{formatDuracao(segundos)}</span>
              {!r.fim && <span className="linha-agora">em andamento</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
