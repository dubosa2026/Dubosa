// Qual é o build mais novo publicado no GitHub Releases (sem dependências do celular: testável).

export interface UpdateInfo {
  build: number;
  url: string;
  size: number;
}

/** Os assets do release se chamam NossaCasa-build<N>.apk; devolve o mais novo. */
export function newestBuild(assets: { name: string; browser_download_url: string; size: number }[]): UpdateInfo | null {
  let best: UpdateInfo | null = null;
  for (const a of assets) {
    const m = /^NossaCasa-build(\d+)\.apk$/.exec(a.name);
    if (m && (!best || Number(m[1]) > best.build)) best = { build: Number(m[1]), url: a.browser_download_url, size: a.size };
  }
  return best;
}
