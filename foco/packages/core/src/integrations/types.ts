import type { EventoIdentificado, FonteEvento } from "../types";

/**
 * PORTAS DE INTEGRAÇÃO.
 *
 * O FOCO precisa funcionar mesmo que o vendedor não registre nada
 * manualmente — mas a V1 também precisa funcionar sem nenhuma integração
 * conectada. Por isso as integrações entram como portas: o núcleo conhece
 * apenas esta interface, e cada conector (agente local do Thunderbird,
 * WhatsApp corporativo) a implementa quando estiver disponível.
 *
 * Limites que valem para qualquer conector, sem exceção:
 * - somente contas e canais CORPORATIVOS, autorizados pela empresa;
 * - nunca WhatsApp pessoal, nunca captura de tela, nunca keylogger;
 * - somente metadados e assunto — nunca o conteúdo integral da conversa;
 * - o vendedor sabe que a integração existe e o que ela coleta.
 */
export interface FonteEventos {
  readonly fonte: FonteEvento;
  /** Nome legível, para o vendedor saber o que está conectado. */
  readonly descricao: string;
  /** Se está conectada agora. A V1 roda com todas desconectadas. */
  disponivel(): Promise<boolean> | boolean;
  /**
   * Eventos ocorridos no período. Cabe ao conector já ter aplicado a
   * triagem de relevância — o motor de evidências confia na relevância
   * mas nunca confia que evento equivale a tempo.
   */
  buscarEventos(userId: string, inicioISO: string, fimISO: string): Promise<EventoIdentificado[]>;
}

/**
 * Registro de conectores ativos. O motor de evidências consulta o que
 * estiver aqui; com o registro vazio, ele simplesmente reporta que só há
 * tempo declarado — que é exatamente o estado da V1.
 */
export class RegistroDeFontes {
  private fontes: FonteEventos[] = [];

  registrar(fonte: FonteEventos): void {
    this.fontes.push(fonte);
  }

  listar(): readonly FonteEventos[] {
    return this.fontes;
  }

  async coletar(userId: string, inicioISO: string, fimISO: string): Promise<EventoIdentificado[]> {
    const eventos: EventoIdentificado[] = [];
    for (const fonte of this.fontes) {
      try {
        if (!(await fonte.disponivel())) continue;
        eventos.push(...(await fonte.buscarEventos(userId, inicioISO, fimISO)));
      } catch {
        // Um conector fora do ar nunca pode derrubar o painel do gerente.
      }
    }
    return eventos;
  }
}
