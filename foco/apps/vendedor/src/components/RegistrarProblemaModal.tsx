import { useState } from "react";
import type { ClassificationResult, Problem } from "../../shared/ipc";

type Etapa = "FORM" | "CLASSIFICANDO" | "CONFIRMAR" | "PROTOCOLO";

export default function RegistrarProblemaModal({
  onClose,
  onRegistrado,
}: {
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>("FORM");
  const [cliente, setCliente] = useState("");
  const [descricao, setDescricao] = useState("");
  const [classificacao, setClassificacao] = useState<ClassificationResult | null>(null);
  const [problemaCriado, setProblemaCriado] = useState<Problem | null>(null);

  async function handleClassificar() {
    setEtapa("CLASSIFICANDO");
    const resposta = await window.foco.classifyProblem(descricao);
    if (resposta.ok) {
      setClassificacao(resposta.data);
      setEtapa("CONFIRMAR");
    } else {
      setEtapa("FORM");
    }
  }

  async function handleConfirmar() {
    if (!classificacao) return;
    const resposta = await window.foco.registerProblem({
      cliente,
      descricao,
      categoria: classificacao.categoria,
      prioridade: classificacao.prioridade,
    });
    if (resposta.ok) {
      setProblemaCriado(resposta.data.problema);
      setEtapa("PROTOCOLO");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {etapa === "FORM" && (
          <>
            <h2>🚨 Registrar Problema</h2>
            <label>
              Cliente
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" />
            </label>
            <label>
              Descreva o problema
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                placeholder='Ex.: "Cliente está reclamando que o pedido ainda não foi faturado."'
              />
            </label>
            <div className="modal-actions">
              <button className="btn-outline" onClick={onClose}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={!cliente || !descricao} onClick={handleClassificar}>
                Continuar
              </button>
            </div>
          </>
        )}

        {etapa === "CLASSIFICANDO" && <p className="modal-loading">Classificando problema...</p>}

        {etapa === "CONFIRMAR" && classificacao && (
          <>
            <h2>Confirme o encaminhamento</h2>
            <div className="classificacao-box">
              <div>
                <strong>Categoria:</strong> {classificacao.categoria}
              </div>
              <div>
                <strong>Prioridade:</strong> {classificacao.prioridade}
              </div>
              <div>
                <strong>Responsável:</strong> {classificacao.areaResponsavel}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setEtapa("FORM")}>
                Voltar
              </button>
              <button className="btn-primary" onClick={handleConfirmar}>
                Encaminhar problema
              </button>
            </div>
          </>
        )}

        {etapa === "PROTOCOLO" && problemaCriado && (
          <>
            <h2>Problema encaminhado</h2>
            <p className="protocolo-numero">Protocolo {problemaCriado.protocolo}</p>
            <p>Você será avisado quando houver atualização.</p>
            <p className="protocolo-destaque">Volte para sua atividade comercial.</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={onRegistrado}>
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
