// Onde o app guarda a configuração do servidor (Supabase) no celular.
// O mesmo APK serve para qualquer projeto Supabase: basta colar a URL e a chave
// pública (anon) na primeira abertura. Se o APK for gerado com
// EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY, já vem configurado.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { FAMILY_SERVER } from './familyServer';

export type AppMode = 'cloud' | 'demo';

export interface BackendConfig {
  mode: AppMode;
  url: string;
  anonKey: string;
}

const KEY = 'nc:backend';

export const BUILT_IN: BackendConfig | null =
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    ? { mode: 'cloud', url: process.env.EXPO_PUBLIC_SUPABASE_URL, anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY }
    : FAMILY_SERVER.url && FAMILY_SERVER.anonKey
      ? { mode: 'cloud', url: FAMILY_SERVER.url, anonKey: FAMILY_SERVER.anonKey }
      : null;

export async function loadBackend(): Promise<BackendConfig | null> {
  let stored: BackendConfig | null = null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as BackendConfig;
  } catch {
    // ignora e usa o padrão
  }
  // Com o servidor da família embutido, ele sempre vale no celular: nunca pergunta
  // endereço/chave (nem se o Android restaurar um backup antigo). No navegador, o
  // modo demonstração continua disponível para testes.
  if (BUILT_IN) return Platform.OS === 'web' && stored?.mode === 'demo' ? stored : BUILT_IN;
  return stored;
}

/** Versão mostrada nas telas (preenchida pelo build do GitHub). */
export const APP_VERSION = `1.0 · build ${process.env.EXPO_PUBLIC_BUILD_NUMBER || 'local'}${process.env.EXPO_PUBLIC_BUILD_DATE ? ` · ${process.env.EXPO_PUBLIC_BUILD_DATE}` : ''}`;

export async function saveBackend(cfg: BackendConfig | null) {
  if (cfg) await AsyncStorage.setItem(KEY, JSON.stringify(cfg));
  else await AsyncStorage.removeItem(KEY);
}

export function validateBackend(url: string, anonKey: string): string | null {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url.trim()) && !/^https?:\/\/[\w.:-]+\/?$/.test(url.trim())) {
    return 'A URL deve ser parecida com https://xxxxxxxx.supabase.co';
  }
  if (anonKey.trim().length < 30) return 'A chave pública (anon key) parece incompleta.';
  return null;
}
