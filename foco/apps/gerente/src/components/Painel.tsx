import type { PainelData } from "../../shared/ipc";
import {
  CATEGORIA_COR,
  CATEGORIA_LABEL,
  SELO_ORIGEM,
  SIMBOLO_SEVERIDADE,
  formatDuracao,
  type CategoriaTempo,
} from "../format";

/**
 * O painel responde, em poucos segundos: como a equipe está usando o
 * tempo, quem está sendo mais impactado, quais áreas consomem mais e onde
 * o gerente precisa atuar hoje. Cada bloco carrega a origem do dado.
 */
export default function Painel({ dados }: { dados: PainelData }) {
  const { visao } = dados;
  const total = visao.tempoEquipe.totalDeclarado.valor;

  const emProblema =
    visao.porVendedor.filter((v) =>
      v.tempo.porCategoria.some((c) => c.categoria === "PROBLEMA_OPERACIONAL" && c.segundos > 0)
    ).length;

  return (
    <>
      {/* ---- KPIs, cada um com sua origem ---- */}
      <section className="kpis">
        <div className="kpi">
          <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
          <div className="kpi-num">{formatDuracao(visao.tempoEquipe.comercialDeclarado.valor)}</div>
          <div className="kpi-rot">Tempo comercial declarado</div>
        </div>
        <div className="kpi">
          <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
          <div className="kpi-num">{formatDuracao(visao.tempoEquipe.operacionalDeclarado.valor)}</div>
          <div className="kpi-rot">Tempo operacional declarado</div>
        </div>
        <div className="kpi">
          <span className={`selo ${SELO_ORIGEM.IDENTIFICADO.classe}`}>{SELO_ORIGEM.IDENTIFICADO.texto}</span>
          <div className="kpi-num">
            {visao.eventosPorArea.reduce((acc, e) => acc + e.quantidade, 0)}
          </div>
          <div className="kpi-rot">Eventos operacionais identificados</div>
        </div>
        <div className="kpi kpi-estimativa">
          <span className={`selo ${SELO_ORIGEM.ESTIMADO.classe}`}>{SELO_ORIGEM.ESTIMADO.texto}</span>
          <div className="kpi-num">{formatDuracao(visao.tempoPotencialRecuperavel.valor)}</div>
          <div className="kpi-rot">Tempo potencialmente recuperável</div>
          <div className="kpi-base">{visao.tempoPotencialRecuperavel.base}</div>
        </div>
      </section>

      <section className="kpis-secundarios">
        <div><b>{dados.equipe.length}</b> vendedores</div>
        <div><b>{emProblema}</b> com tempo em problema operacional</div>
        <div><b>{visao.problemasAbertos}</b> chamados em aberto</div>
      </section>

      {/* ---- Alertas ---- */}
      <section className="painel">
        <div className="painel-cabeca">
          <h2>Onde atuar hoje</h2>
          <span className="rotulo">{dados.alertas.length} alerta(s)</span>
        </div>
        {dados.alertas.length === 0 && <p className="vazio">Nada exigindo sua atenção no período.</p>}
        <ul className="lista">
          {dados.alertas.map((a) => (
            <li key={a.id} className={`alerta alerta-${a.severidade.toLowerCase()}`}>
              <span className="alerta-simbolo">{SIMBOLO_SEVERIDADE[a.severidade]}</span>
              <div>
                <div className="alerta-texto">{a.texto}</div>
                <div className="alerta-evidencia">
                  <span className={`selo ${SELO_ORIGEM[a.origem].classe}`}>{SELO_ORIGEM[a.origem].texto}</span>
                  {a.evidencia}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Tempo declarado da equipe ---- */}
      <section className="painel">
        <div className="painel-cabeca">
          <h2>Tempo da equipe</h2>
          <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
        </div>
        <p className="nota-origem">
          Vem do cronômetro de cada vendedor. Registra o que a equipe <strong>declarou</strong> estar
          fazendo — não comprova a atividade, e não deve ser lido como avaliação de ninguém.
        </p>

        <div className="barra">
          {total === 0 ? (
            <div className="barra-vazia">Nenhum tempo declarado no período</div>
          ) : (
            visao.tempoEquipe.porCategoria
              .filter((c) => c.segundos > 0)
              .map((c) => (
                <i
                  key={c.categoria}
                  style={{
                    width: `${(c.segundos / total) * 100}%`,
                    background: CATEGORIA_COR[c.categoria as CategoriaTempo],
                  }}
                  title={`${CATEGORIA_LABEL[c.categoria as CategoriaTempo]} — ${formatDuracao(c.segundos)}`}
                />
              ))
          )}
        </div>
        <div className="legenda">
          {visao.tempoEquipe.porCategoria
            .filter((c) => c.segundos > 0)
            .map((c) => (
              <div key={c.categoria}>
                <span className="ponto" style={{ background: CATEGORIA_COR[c.categoria as CategoriaTempo] }} />
                <b>{total === 0 ? 0 : Math.round((c.segundos / total) * 100)}%</b>
                <span>{CATEGORIA_LABEL[c.categoria as CategoriaTempo]}</span>
              </div>
            ))}
        </div>
      </section>

      <div className="grade-2">
        {/* ---- Mapa de consumo por área ---- */}
        <section className="painel">
          <div className="painel-cabeca">
            <h2>Áreas que mais interrompem</h2>
            <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
          </div>
          {visao.tempoPorAreaDeclarado.length === 0 && (
            <p className="vazio">Nenhum tempo declarado em problemas no período.</p>
          )}
          <ul className="lista">
            {visao.tempoPorAreaDeclarado.map((a) => (
              <li key={a.area} className="area">
                <div className="area-topo">
                  <b>{a.area}</b>
                  <span>{a.percent}% · {formatDuracao(a.segundos)}</span>
                </div>
                <div className="trilho"><i style={{ width: `${a.percent}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Eventos identificados ---- */}
        <section className="painel">
          <div className="painel-cabeca">
            <h2>Movimento identificado</h2>
            <span className={`selo ${SELO_ORIGEM.IDENTIFICADO.classe}`}>{SELO_ORIGEM.IDENTIFICADO.texto}</span>
          </div>
          <p className="nota-origem">
            Mensagens de e-mail e WhatsApp corporativo classificadas pelas integrações.
            <strong> Não representam tempo medido</strong> — indicam de onde vem a pressão.
          </p>
          {visao.eventosPorArea.length === 0 && (
            <p className="vazio">Nenhuma integração conectada ainda, ou nenhum evento relevante no período.</p>
          )}
          <ul className="lista">
            {visao.eventosPorArea.map((e) => (
              <li key={e.categoria} className="evento-linha">
                <span>{e.area}</span>
                <b>{e.quantidade}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---- Insights ---- */}
      <section className="painel">
        <div className="painel-cabeca">
          <h2>Leitura do período</h2>
        </div>
        {dados.insights.length === 0 && <p className="vazio">Sem padrões relevantes no período.</p>}
        <ul className="lista">
          {dados.insights.map((i) => (
            <li key={i.id} className="insight">
              <div className="insight-topo">
                <h3>{i.titulo}</h3>
                <span className={`selo ${SELO_ORIGEM[i.origem].classe}`}>{SELO_ORIGEM[i.origem].texto}</span>
              </div>
              <p className="insight-corpo">{i.corpo}</p>
              <ul className="insight-evidencias">
                {i.evidencias.map((e, n) => <li key={n}>{e}</li>)}
              </ul>
              <div className="insight-sugestao">→ {i.sugestao}</div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
