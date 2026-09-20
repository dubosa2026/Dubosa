import { useEffect, useState } from "react";
import type { CategoriaTempo, HomeData } from "../../shared/ipc";
import { CATEGORIAS_ORDEM, CATEGORIA_COR, CATEGORIA_LABEL, formatDuracao } from "../format";
import RegistrarProblemaModal from "../components/RegistrarProblemaModal";
import EstouPresoModal from "../components/EstouPresoModal";
import HistoricoChamados from "../components/HistoricoChamados";
import LinhaDoDia from "../components/LinhaDoDia";

export default function Home({ initialData, onLogout }: { initialData: HomeData; onLogout: () => void }) {
  const [data, setData] = useState<HomeData>(initialData);
  const [modalProblema, setModalProblema] = useState(false);
  const [modalPreso, setModalPreso] = useState(false);
  const [, forcarRender] = useState(0);

  // O cronômetro corrente é desenhado a partir do horário de início; o
  // relógio só redesenha a tela, nunca grava nada.
  useEffect(() => {
    const id = setInterval(() => {
      if (data.blocoAtivo) forcarRender((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [data.blocoAtivo]);

  async function atualizar() {
    const r = await window.foco.getHome();
    if (r.ok) setData(r.data);
  }

  async function iniciar(categoria: CategoriaTempo) {
    const r = await window.foco.iniciarBloco(categoria);
    if (r.ok) setData(r.data);
  }

  async function parar() {
    const r = await window.foco.pararBloco();
    if (r.ok) setData(r.data);
  }

  const { visao, blocoAtivo } = data;
  const problemaAtual =
    blocoAtivo?.categoria === "PROBLEMA_OPERACIONAL" && blocoAtivo.problemaId
      ? data.chamados.find((p) => p.id === blocoAtivo.problemaId) ?? null
      : null;

  const segundosAtivo = blocoAtivo
    ? Math.max(0, Math.round((Date.now() - new Date(blocoAtivo.inicio).getTime()) / 1000))
    : 0;

  const totalDeclarado = visao.tempo.totalDeclarado.valor;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-title">FOCO</div>
          <div className="app-subtitle">{data.user.nome}</div>
        </div>
        <button className="btn-link" onClick={onLogout}>Sair</button>
      </header>

      {/* Cronômetro: o estado atual, em primeiro plano */}
      <section className="cronometro">
        <div className="cronometro-estado">
          <span className="rotulo">Agora</span>
          <div className="cronometro-categoria">
            {blocoAtivo ? (
              <>
                <span className="ponto" style={{ background: CATEGORIA_COR[blocoAtivo.categoria] }} />
                {CATEGORIA_LABEL[blocoAtivo.categoria]}
              </>
            ) : (
              <span className="sem-bloco">Nenhuma atividade em andamento</span>
            )}
          </div>
          {blocoAtivo && <div className="cronometro-tempo">{formatDuracao(segundosAtivo)}</div>}
        </div>

        <div className="cronometro-botoes">
          {CATEGORIAS_ORDEM.map((c) => (
            <button
              key={c}
              className={blocoAtivo?.categoria === c ? "cat-btn cat-ativa" : "cat-btn"}
              style={blocoAtivo?.categoria === c ? { borderColor: CATEGORIA_COR[c] } : undefined}
              onClick={() => iniciar(c)}
            >
              <span className="ponto" style={{ background: CATEGORIA_COR[c] }} />
              {CATEGORIA_LABEL[c]}
            </button>
          ))}
          {blocoAtivo && (
            <button className="cat-btn cat-parar" onClick={parar}>■ Parar</button>
          )}
        </div>
      </section>

      {/* Tempo do dia — sempre rotulado como DECLARADO */}
      <section className="painel">
        <div className="painel-cabeca">
          <h2>Seu tempo hoje</h2>
          <span className="selo selo-declarado">tempo declarado</span>
        </div>
        <p className="nota-origem">
          Estes números vêm do seu cronômetro. Eles registram o que você <strong>informou</strong> estar
          fazendo — não são uma avaliação do seu trabalho.
        </p>

        <div className="barra">
          {totalDeclarado === 0 ? (
            <div className="barra-vazia">Nenhum tempo declarado hoje</div>
          ) : (
            visao.tempo.porCategoria
              .filter((c) => c.segundos > 0)
              .map((c) => (
                <i
                  key={c.categoria}
                  style={{
                    width: `${(c.segundos / totalDeclarado) * 100}%`,
                    background: CATEGORIA_COR[c.categoria],
                  }}
                  title={`${CATEGORIA_LABEL[c.categoria]} — ${formatDuracao(c.segundos)}`}
                />
              ))
          )}
        </div>

        <div className="legenda">
          {visao.tempo.porCategoria
            .filter((c) => c.segundos > 0)
            .map((c) => (
              <div key={c.categoria}>
                <span className="ponto" style={{ background: CATEGORIA_COR[c.categoria] }} />
                <b>{formatDuracao(c.segundos)}</b>
                <span>{CATEGORIA_LABEL[c.categoria]}</span>
              </div>
            ))}
        </div>

        <div className="resumo-linhas">
          <div>
            <span>Comercial + atendimento declarados</span>
            <b>{formatDuracao(visao.tempo.comercialDeclarado.valor)}</b>
          </div>
          <div>
            <span>Operacional declarado</span>
            <b>{formatDuracao(visao.tempo.operacionalDeclarado.valor)}</b>
          </div>
          <div>
            <span>Interrupções declaradas</span>
            <b>{visao.interrupcoesDeclaradas}</b>
          </div>
        </div>
      </section>

      <section className="acoes">
        <button className="btn-alerta btn-grande" onClick={() => setModalProblema(true)}>
          🚨 Registrar problema operacional
        </button>
        {problemaAtual && !problemaAtual.preso && (
          <button className="btn-sos" onClick={() => setModalPreso(true)}>
            🆘 Estou preso neste problema
          </button>
        )}
        {problemaAtual?.preso && (
          <div className="ajuda-enviada">
            🆘 Ajuda solicitada em {problemaAtual.protocolo}. Seu gerente foi avisado.
          </div>
        )}
      </section>

      <div className="grade-2">
        <HistoricoChamados chamados={data.chamados} onAtualizar={atualizar} />
        <LinhaDoDia registros={data.registrosDeHoje} chamados={data.chamados} />
      </div>

      <p className="rodape">
        O FOCO não existe para vigiar você. Existe para identificar o que está tirando seu tempo e
        permitir que isso seja removido.
      </p>

      {modalProblema && (
        <RegistrarProblemaModal
          onFechar={() => setModalProblema(false)}
          onRegistrado={async () => {
            setModalProblema(false);
            await atualizar();
          }}
        />
      )}

      {modalPreso && problemaAtual && (
        <EstouPresoModal
          problema={problemaAtual}
          onFechar={() => setModalPreso(false)}
          onEnviado={async () => {
            setModalPreso(false);
            await atualizar();
          }}
        />
      )}
    </div>
  );
}
