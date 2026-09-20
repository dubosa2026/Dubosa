import type { FocoApi } from "../electron/preload";

declare global {
  interface Window {
    foco: FocoApi;
  }
}

export {};
