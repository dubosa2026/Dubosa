// Aviso de "nova versão" com o botão que atualiza o app por dentro.
import { useEffect, useState } from 'react';
import { checkForUpdate, CURRENT_BUILD, downloadAndInstall, type UpdateInfo } from '../data/updater';
import { Banner, Button, Progress, T } from './components';

let cached: { at: number; info: UpdateInfo | null } | null = null;

export function useUpdate(force = 0) {
  const [info, setInfo] = useState<UpdateInfo | null>(cached?.info ?? null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let alive = true;
    // Confere no máximo a cada 30 minutos (ou quando pedirem).
    if (!force && cached && Date.now() - cached.at < 30 * 60 * 1000) return;
    setChecking(true);
    void checkForUpdate().then((r) => {
      cached = { at: Date.now(), info: r };
      if (alive) {
        setInfo(r);
        setChecking(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [force]);
  return { info, checking };
}

export function UpdateBanner({ info }: { info: UpdateInfo }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const start = async () => {
    setErr(null);
    setProgress(0);
    try {
      await downloadAndInstall(info, setProgress);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setProgress(null);
    }
  };
  const mb = Math.round(info.size / 1e6);
  return (
    <Banner kind="success" text={`Nova versão do app disponível (build ${info.build}; você está no ${CURRENT_BUILD}).`}>
      {progress !== null ? (
        <>
          <T size="small">Baixando… {Math.round(progress * 100)}%</T>
          <Progress value={progress} />
        </>
      ) : (
        <Button label={`Atualizar agora (${mb} MB)`} icon="⬇️" onPress={start} />
      )}
      {err ? <T size="small">{err}</T> : null}
      <T muted size="small">Depois do download, toque em “Atualizar”/“Instalar”. Se o Android pedir, permita instalar apps do Nossa Casa. Seus dados continuam.</T>
    </Banner>
  );
}
