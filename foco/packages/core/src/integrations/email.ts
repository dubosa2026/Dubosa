import { TriadorPorRegras } from "../classifier";
import type { ClassificadorEvento, EventoIdentificado, FonteEvento } from "../types";
import type { FonteEventos } from "./types";

/**
 * AGENTE LOCAL DE E-MAIL (Thunderbird / POP).
 *
 * A empresa usa Thunderbird com POP, não IMAP. Isso tem uma consequência
 * arquitetural que não dá para contornar: as mensagens são baixadas para o
 * notebook do vendedor e apagadas do servidor, então NÃO existe uma caixa
 * central para a API consultar. Qualquer desenho que assuma "o servidor lê
 * a caixa de todo mundo" está errado neste ambiente.
 *
 * Por isso a leitura acontece num Agente FOCO instalado no notebook, que:
 * - lê o índice local do perfil do Thunderbird (pasta do perfil, mbox/maildir);
 * - extrai SOMENTE metadados: data, remetente, destinatário, assunto;
 * - nunca lê o corpo da mensagem, nunca anexos, nunca contas pessoais;
 * - classifica a relevância localmente e envia à API central apenas o
 *   evento já reduzido (assunto + categoria + relevância).
 *
 * O que trafega para o servidor é o mínimo necessário para o gerente
 * entender a carga operacional — não o conteúdo da correspondência.
 */

export interface MensagemLocal {
  id: string;
  recebidoEm: string;
  remetente: string;
  assunto: string;
  /** true quando o vendedor está apenas em cópia. */
  emCopia?: boolean;
}

/** Contrato que o Agente FOCO local implementa no notebook do vendedor. */
export interface LeitorCaixaLocal {
  /** Metadados das mensagens do período, já filtradas para a conta corporativa. */
  listarMensagens(inicioISO: string, fimISO: string): Promise<MensagemLocal[]>;
}

export class FonteEmailLocal implements FonteEventos {
  readonly fonte: FonteEvento = "EMAIL";
  readonly descricao = "E-mail corporativo (Agente FOCO local, Thunderbird/POP)";

  constructor(
    private readonly leitor: LeitorCaixaLocal | null,
    private readonly triador: ClassificadorEvento = new TriadorPorRegras()
  ) {}

  disponivel(): boolean {
    return this.leitor !== null;
  }

  async buscarEventos(userId: string, inicioISO: string, fimISO: string): Promise<EventoIdentificado[]> {
    if (!this.leitor) return [];
    const mensagens = await this.leitor.listarMensagens(inicioISO, fimISO);
    const eventos: EventoIdentificado[] = [];

    for (const msg of mensagens) {
      const triagem = await this.triador.triar(msg.assunto, msg.remetente);
      if (triagem.relevancia === "IGNORAR") continue;

      eventos.push({
        id: `email:${msg.id}`,
        userId,
        fonte: "EMAIL",
        ocorridoEm: msg.recebidoEm,
        assunto: msg.assunto,
        categoria: triagem.categoria,
        // Estar apenas em cópia rebaixa a relevância: ler um e-mail em
        // cópia não é a mesma interrupção que ser cobrado diretamente.
        relevancia: msg.emCopia && triagem.relevancia === "ALTA" ? "MEDIA" : triagem.relevancia,
        problemaId: null,
      });
    }
    return eventos;
  }
}
