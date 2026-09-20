import { TriadorPorRegras } from "../classifier";
import type { ClassificadorEvento, EventoIdentificado, FonteEvento } from "../types";
import type { FonteEventos } from "./types";

/**
 * WHATSAPP CORPORATIVO.
 *
 * Somente por meios oficiais e autorizados — a WhatsApp Business Platform
 * (API oficial da Meta) ou a plataforma de atendimento que a empresa já
 * usar, com webhooks assinados. O FOCO não automatiza o WhatsApp Web, não
 * lê banco de dados de aplicativo e não instala nada no celular de
 * ninguém: além de violar os termos da plataforma, seria vigilância.
 *
 * Nunca entra aqui:
 * - número pessoal do vendedor;
 * - conversa privada, de qualquer natureza;
 * - conteúdo integral das mensagens.
 *
 * Entra apenas: que houve uma conversa, com que cliente (quando a conta
 * corporativa já identifica), sobre que assunto, e qual a relevância.
 * Enquanto não houver API contratada, esta fonte simplesmente se declara
 * indisponível e o FOCO segue funcionando com tempo declarado.
 */

export interface ConversaCorporativa {
  id: string;
  ocorridoEm: string;
  /** Nome/identificação do cliente na conta corporativa, quando houver. */
  cliente?: string | null;
  /** Resumo do assunto produzido pela plataforma — nunca a transcrição. */
  assunto: string;
  direcao: "RECEBIDA" | "ENVIADA";
}

/** Contrato que um conector oficial de WhatsApp implementa. */
export interface ProvedorWhatsApp {
  conectado(): Promise<boolean> | boolean;
  listarConversas(userId: string, inicioISO: string, fimISO: string): Promise<ConversaCorporativa[]>;
}

export class FonteWhatsAppCorporativo implements FonteEventos {
  readonly fonte: FonteEvento = "WHATSAPP";
  readonly descricao = "WhatsApp corporativo (API oficial)";

  constructor(
    private readonly provedor: ProvedorWhatsApp | null,
    private readonly triador: ClassificadorEvento = new TriadorPorRegras()
  ) {}

  async disponivel(): Promise<boolean> {
    if (!this.provedor) return false;
    return this.provedor.conectado();
  }

  async buscarEventos(userId: string, inicioISO: string, fimISO: string): Promise<EventoIdentificado[]> {
    if (!this.provedor) return [];
    const conversas = await this.provedor.listarConversas(userId, inicioISO, fimISO);
    const eventos: EventoIdentificado[] = [];

    for (const conversa of conversas) {
      const triagem = await this.triador.triar(conversa.assunto, conversa.cliente ?? undefined);
      if (triagem.relevancia === "IGNORAR") continue;
      eventos.push({
        id: `whatsapp:${conversa.id}`,
        userId,
        fonte: "WHATSAPP",
        ocorridoEm: conversa.ocorridoEm,
        assunto: conversa.assunto,
        categoria: triagem.categoria,
        relevancia: triagem.relevancia,
        cliente: conversa.cliente ?? null,
        problemaId: null,
      });
    }
    return eventos;
  }
}
