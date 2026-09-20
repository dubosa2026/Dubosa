/**
 * Geração do número de protocolo mostrado ao vendedor após registrar um
 * problema (ex.: "#2841"). O contador é persistido pelo repositório para
 * garantir sequência única mesmo entre reinícios do app.
 */
export function formatProtocolo(sequencia: number): string {
  return `#${sequencia}`;
}
