import { useEffect, useState } from "react";
import type { VendedorData } from "../../shared/ipc";
import {
  CATEGORIA_COR,
  CATEGORIA_LABEL,
  SELO_ORIGEM,
  SIMBOLO_SEVERIDADE,
  STATUS_LABEL,
  formatDuracao,
  formatHora,
  type CategoriaTempo,
} from "../format";

/**
 * A visão individual existe para o gerente entender o que está no caminho
 * de UMA pessoa — não para avaliá-la. Por isso ela abre pelo tempo
 * operacional e pelas áreas que a interromperam, não por produtividade.
 */
export default function VisaoIndividual({
  userId,
  onVoltar,
}: {
  userId: string;
  onVoltar: () => void;
}) {
  const [dados, setDados] = useState<VendedorData | null>(null);

  useEffect(() => {
    window.focoGer.getVendedor(userId).then((r) => {
      if (r.ok) setDados(r.data);
    });
  }, [userId]);

  if (!dados) return <p className="vazio">Carregando…</p>;

  const { visao } = dados;
  const total = visao.tempo.totalDeclarado.valor;

  return (
    <div>
      <button className="voltar" onClick={onVoltar}>‹ Voltar para a equipe</button>

      <div className="individual-cabeca">
        <h2>{dados.user.nome}</h2>
        <span className="rotulo">{dados.user.email}</span>
      </div>

      <section className="kpis">
        <div className="kpi">
          <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
          <div className="kpi-num">{formatDuracao(visao.tempo.comercialDeclarado.valor)}</div>
          <div className="kpi-rot">Comercial + atendimento</div>
        </div>
        <div className="kpi">
          <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
          <div className="kpi-num">{formatDuracao(visao.tempo.operacionalDeclarado.valor)}</div>
          <div className="kpi-rot">Operacional declarado</div>
        </div>
        <div className="kpi">
          <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
          <div className="kpi-num">{visao.interrupcoesDeclaradas}</div>
          <div className="kpi-rot">Interrupções</div>
        </div>
        <div className="kpi kpi-estimativa">
          <span className={`selo ${SELO_ORIGEM.ESTIMADO.classe}`}>{SELO_ORIGEM.ESTIMADO.texto}</span>
          <div className="kpi-num">{formatDuracao(visao.tempoPotencialRecuperavel.valor)}</div>
          <div className="kpi-rot">Potencialmente recuperável</div>
          <div className="kpi-base">{visao.tempoPotencialRecuperavel.base}</div>
        </div>
      </section>

      {dados.alertas.length > 0 && (
        <section className="painel">
          <div className="painel-cabeca"><h2>Alertas</h2></div>
          <ul className="lista">
            {dados.alertas.map((a) => (
              <li key={a.id} className={`alerta alerta-${a.severidade.toLowerCase()}`}>
                <span className="alerta-simbolo">{SIMBOLO_SEVERIDADE[a.severidade]}</span>
                <div>
                  <div className="alerta-texto">{a.texto}</div>
                  <div className="alerta-evidencia">{a.evidencia}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="painel">
        <div className="painel-cabeca">
          <h2>Tempo declarado</h2>
          <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
        </div>
        <div className="barra">
          {total === 0 ? (
            <div className="barra-vazia">Nenhum tempo declarado no período</div>
          ) : (
            visao.tempo.porCategoria
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
          {visao.tempo.porCategoria
            .filter((c) => c.segundos > 0)
            .map((c) => (
              <div key={c.categoria}>
                <span className="ponto" style={{ background: CATEGORIA_COR[c.categoria as CategoriaTempo] }} />
                <b>{formatDuracao(c.segundos)}</b>
                <span>{CATEGORIA_LABEL[c.categoria as CategoriaTempo]}</span>
              </div>
            ))}
        </div>
      </section>

      <div className="grade-2">
        <section className="painel">
          <div className="painel-cabeca"><h2>Áreas que o interromperam</h2></div>
          {visao.tempoPorAreaDeclarado.length === 0 && <p className="vazio">Nenhuma no período.</p>}
          <ul className="lista">
            {visao.tempoPorAreaDeclarado.map((a) => (
              <li key={a.area} className="area">
                <div className="area-topo">
                  <b>{a.area}</b>
                  <span>{formatDuracao(a.segundos)}</span>
                </div>
                <div className="trilho"><i style={{ width: `${a.percent}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="painel">
          <div className="painel-cabeca"><h2>Chamados</h2></div>
          {dados.problemas.length === 0 && <p className="vazio">Nenhum chamado registrado.</p>}
          <ul className="lista chamados">
            {dados.problemas.slice(0, 12).map((p) => (
              <li key={p.id} className="chamado">
                <div className="chamado-topo">
                  <span className="protocolo">{p.protocolo}</span>
                  <span className="chip">{STATUS_LABEL[p.status]}</span>
                </div>
                <div className="chamado-desc">{p.descricao}</div>
                <div className="chamado-meta">
                  <span>{p.areaResponsavel}</span>
                  <span>{formatHora(p.criadoEm)}</span>
                  {p.preso && <span className="preso">🆘 pediu ajuda</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="painel">
        <div className="painel-cabeca">
          <h2>Histórico do cronômetro</h2>
          <span className={`selo ${SELO_ORIGEM.DECLARADO.classe}`}>{SELO_ORIGEM.DECLARADO.texto}</span>
        </div>
        <ul className="linha-dia">
          {dados.registros
            .slice()
            .sort((a, b) => a.inicio.localeCompare(b.inicio))
            .map((r) => {
              const seg = Math.max(
                0,
                Math.round(
                  ((r.fim ? new Date(r.fim).getTime() : Date.now()) - new Date(r.inicio).getTime()) / 1000
                )
              );
              return (
                <li key={r.id}>
                  <span className="linha-hora">{formatHora(r.inicio)}</span>
                  <span className="ponto" style={{ background: CATEGORIA_COR[r.categoria as CategoriaTempo] }} />
                  <span className="linha-cat">
                    {CATEGORIA_LABEL[r.categoria as CategoriaTempo]}
                    {r.alteracoes && r.alteracoes.length > 0 && (
                      <span className="linha-alterado"> · editado</span>
                    )}
                  </span>
                  <span className="linha-dur">{formatDuracao(seg)}</span>
                </li>
              );
            })}
          {dados.registros.length === 0 && <p className="vazio">Nenhum bloco no período.</p>}
        </ul>
      </section>
    </div>
  );
}
