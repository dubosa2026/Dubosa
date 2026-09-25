import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { BackendConfig } from './config';

let client: SupabaseClient | null = null;
let clientKey = '';

export function getSupabase(cfg: BackendConfig): SupabaseClient {
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (client && clientKey === key) return client;
  client = createClient(cfg.url.replace(/\/$/, ''), cfg.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  clientKey = key;
  return client;
}

export function currentSupabase(): SupabaseClient | null {
  return client;
}

export function resetSupabase() {
  client = null;
  clientKey = '';
}
