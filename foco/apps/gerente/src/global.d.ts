import type { FocoGerApi } from "../electron/preload";

declare global {
  interface Window {
    focoGer: FocoGerApi;
  }
}

export {};
