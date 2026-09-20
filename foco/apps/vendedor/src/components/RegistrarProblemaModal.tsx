import { useState } from "react";
import type { CategoriaProblema, Problema, ResultadoClassificacao } from "../../shared/ipc";

type Etapa = "FORMULARIO" | "CLASSIFICANDO" | "CONFIRMAR" | "PROTOCOLO";

const AREAS: Array<{ valor: CategoriaProblema; label: string }> = [
  { valor: "FINANCEIRO", label: "Financeiro" },
  { valor: "LOGISTICA", label: "Logística" },
  { valor: "CREDITO", label: "Crédito" },
  { valor: "CADASTRO", label: "Cadastro" },
  { valor: "FISCAL", label: "Fiscal" },
  { valor: "PRODUTO", label: "Produto" },
  { valor: "COMERCIAL", label: "Comercial" },
  { valor: "OUTROS", label: "Outros" },
];

export default function RegistrarProblemaModal({
  onFechar,
  onRegistrado,
}: {
  onFechar: () => void;
  onRegistrado: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>("FORMULARIO");
  const [cliente, setCliente] = useState("");
  const [descricao, setDescricao] = useState("");
  const [classificacao, setClassificacao] = useState<ResultadoClassificacao | null>(null);
  const [categoria, setCategoria] = useState<CategoriaProblema>("OUTROS");
  const [criado, setCriado] = useState<Problema | null>(null);

  async function classificar() {
    setEtapa("CLASSIFICANDO");
    const r = await window.foco.classificar(descricao);
    if (r.ok) {
      setClassificacao(r.data);
      setCategoria(r.data.categoria);
      setEtapa("CONFIRMAR");
    } else {
      setEtapa("FORMULARIO");
    }
  }

  async function confirmar() {
    if (!classificacao) return;
    const r = await window.foco.registrarProblema({
      cliente: cliente || null,
      descricao,
      categoria,
      prioridade: classificacao.prioridade,
    });
    if (r.ok) {
      setCriado(r.data.problema);
      setEtapa("PROTOCOLO");
    }
  }

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true">
        {etapa === "FORMULARIO" && (
          <>
            <h3>🚨 Registrar problema operacional</h3>
            <p className="modal-sub">
              Descreva com suas palavras. O FOCO classifica, encaminha para a área responsável e passa
              a contar o tempo que isso está custando.
            </p>
            <div className="campo">
              <label htmlFor="prob-cliente">Cliente (opcional)</label>
              <input
                id="prob-cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Ex.: Solar Pontal Integradora"
              />
            </div>
            <div className="campo">
              <label htmlFor="prob-desc">O que está acontecendo?</label>
              <textarea
                id="prob-desc"
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: cliente reclamando que o pedido ainda não foi faturado."
              />
            </div>
            <div className="modal-acoes">
              <button className="btn" onClick={onFechar}>Cancelar</button>
              <button className="btn btn-primario" disabled={!descricao.trim()} onClick={classificar}>
                Continuar
              </button>
            </div>
          </>
        )}

        {etapa === "CLASSIFICANDO" && <p className="modal-carregando">Classificando…</p>}

        {etapa === "CONFIRMAR" && classificacao && (
          <>
            <h3>Confira o encaminhamento</h3>
            <p className="modal-sub">Classificado automaticamente. Ajuste a área se não estiver certo.</p>
            <div className="leitura">
              <div className="leitura-linha">
                <span>Prioridade</span>
                <b>{classificacao.prioridade}</b>
              </div>
              <div className="leitura-linha">
                <span>Leitura do sistema</span>
                <b>{classificacao.resumo}</b>
              </div>
            </div>
            <div className="campo" style={{ marginTop: 14 }}>
              <label htmlFor="prob-area">Área responsável</label>
              <select
                id="prob-area"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaProblema)}
              >
                {AREAS.map((a) => (
                  <option key={a.valor} value={a.valor}>{a.label}</option>
                ))}
              </select>
            </div>
            <div className="modal-acoes">
              <button className="btn" onClick={() => setEtapa("FORMULARIO")}>Voltar</button>
              <button className="btn btn-primario" onClick={confirmar}>Registrar e encaminhar</button>
            </div>
          </>
        )}

        {etapa === "PROTOCOLO" && criado && (
          <>
            <h3>Problema registrado</h3>
            <div className="protocolo-grande">{criado.protocolo}</div>
            <p className="modal-sub">
              Encaminhado para {criado.areaResponsavel}. O tempo que isso consumir fica registrado —
              é o que permite mostrar ao gerente o custo real deste obstáculo.
            </p>
            <div className="modal-acoes">
              <button className="btn btn-primario" onClick={onRegistrado}>OK</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
