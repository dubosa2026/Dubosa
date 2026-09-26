// Atualização do app por dentro do próprio app (Android): procura um build mais
// novo no GitHub Releases, baixa o APK para o celular e abre o instalador do
// Android. Assim ninguém precisa passar pelo navegador nem pela pasta Downloads.
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { newestBuild, type UpdateInfo } from '../domain/release';

export type { UpdateInfo };

const RELEASE_API = 'https://api.github.com/repos/dubosa2026/Dubosa/releases/tags/nossa-casa-latest';

/** Número do build deste APK (preenchido pelo GitHub Actions; 0 = versão de desenvolvimento). */
export const CURRENT_BUILD = Number(process.env.EXPO_PUBLIC_BUILD_NUMBER || 0);

/** Existe versão mais nova que a instalada? (null = não, ou sem como saber agora) */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android' || !CURRENT_BUILD) return null;
  try {
    const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const rel = (await res.json()) as { assets?: { name: string; browser_download_url: string; size: number }[] };
    const best = newestBuild(rel.assets ?? []);
    return best && best.build > CURRENT_BUILD ? best : null;
  } catch {
    return null;
  }
}

/** Baixa o APK (com progresso de 0 a 1) e abre o instalador do Android. */
export async function downloadAndInstall(u: UpdateInfo, onProgress: (fraction: number) => void): Promise<void> {
  if (!FileSystem.cacheDirectory) throw new Error('Sem espaço de armazenamento disponível.');
  const dest = `${FileSystem.cacheDirectory}NossaCasa-build${u.build}.apk`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  const task = FileSystem.createDownloadResumable(u.url, dest, {}, (p) => {
    const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : u.size;
    if (total > 0) onProgress(Math.min(1, p.totalBytesWritten / total));
  });
  const result = await task.downloadAsync();
  if (!result || result.status !== 200) throw new Error('Não consegui baixar a atualização. Confira a internet e tente de novo.');
  const info = await FileSystem.getInfoAsync(result.uri);
  if (u.size && info.exists && 'size' in info && info.size !== u.size) {
    throw new Error('O download veio incompleto. Tente de novo (de preferência no Wi-Fi).');
  }
  onProgress(1);
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  // FLAG_GRANT_READ_URI_PERMISSION (1): deixa o instalador do Android ler o arquivo.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1,
    type: 'application/vnd.android.package-archive',
  });
}
