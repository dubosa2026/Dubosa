import type { PainelData } from "../../shared/ipc";
import { CATEGORIA_COR, CATEGORIA_LABEL, formatDuracao, type CategoriaTempo } from "../format";

/**
 * Lista da equipe. Ordenada por carga operacional declarada — quem está
 * absorvendo mais operação aparece primeiro, porque é quem provavelmente
 * precisa que alguém tire algo do caminho.
 */
export default function Equipe({
  dados,
  onAbrirVendedor,
}: {
  dados: PainelData;
  onAbrirVendedor: (userId: string) => void;
}) {
  const linhas = dados.visao.porVendedor
    .map((v) => {
      const user = dados.equipe.find((u) => u.id === v.userId);
      const operacional =
        v.tempo.porCategoria.find((c) => c.categoria === "PROBLEMA_OPERACIONAL")?.segundos ?? 0;
      const preso = dados.problemas.some((p) => p.userId === v.userId && p.preso && p.status !== "RESOLVIDO");
      const maior = v.tempo.porCategoria.reduce(
        (a, b) => (b.segundos > a.segundos ? b : a),
        v.tempo.porCategoria[0]
      );
      return { v, user, operacional, preso, maior };
    })
    .sort((a, b) => b.operacional - a.operacional);

  return (
    <section className="painel">
      <div className="painel-cabeca">
        <h2>Equipe</h2>
        <span className="rotulo">{linhas.length} vendedores · ordenados por carga operacional</span>
      </div>

      <ul className="lista">
        {linhas.map(({ v, user, operacional, preso, maior }) => (
          <li key={v.userId}>
            <button className="vendedor" onClick={() => onAbrirVendedor(v.userId)}>
              <div className="vendedor-esq">
                <div className="vendedor-nome">
                  {user?.nome ?? "Vendedor"}
                  {preso && <span className="tag-ajuda">🆘 pediu ajuda</span>}
                </div>
                <div className="vendedor-estado">
                  <span
                    className="ponto"
                    style={{ background: CATEGORIA_COR[(maior?.categoria ?? "PAUSA") as CategoriaTempo] }}
                  />
                  maior parte do tempo em {CATEGORIA_LABEL[(maior?.categoria ?? "PAUSA") as CategoriaTempo]}
                </div>
              </div>
              <div className="vendedor-dir">
                <div className="vendedor-metrica">
                  <b>{formatDuracao(operacional)}</b>
                  <span>operacional declarado</span>
                </div>
                <div className="vendedor-metrica">
                  <b>{v.interrupcoesDeclaradas}</b>
                  <span>interrupções</span>
                </div>
                <div className="vendedor-metrica">
                  <b>{v.problemasAbertos}</b>
                  <span>em aberto</span>
                </div>
                <span className="seta">›</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
