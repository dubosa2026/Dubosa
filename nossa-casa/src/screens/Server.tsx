import { useState } from 'react';
import { app } from '../data/app';
import { validateBackend } from '../data/config';
import { Banner, Button, Card, Field, H2, Screen, T } from '../ui/components';

export function ServerScreen() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    const e = validateBackend(url, key);
    setErr(e);
    if (e) return;
    setBusy(true);
    try {
      await app.configureServer({ mode: 'cloud', url: url.trim(), anonKey: key.trim() });
    } catch (x) {
      setErr(String((x as Error).message ?? x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Bem-vindos ao Nossa Casa ❤️" subtitle="Organização da casa, das crianças e do tempo em família.">
      <Card>
        <H2>Conectar ao servidor da família</H2>
        <T muted>
          Para Eduardo e Jussara verem as mesmas tarefas em tempo real, o app usa um banco de dados gratuito no Supabase.
          Cole abaixo os dados do projeto (Project Settings → API). Só precisa fazer isso uma vez em cada celular.
        </T>
        <Field label="URL do projeto" placeholder="https://xxxxxxxx.supabase.co" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={url} onChangeText={setUrl} />
        <Field label="Chave pública (anon / publishable key)" placeholder="eyJhbGciOi..." autoCapitalize="none" autoCorrect={false} value={key} onChangeText={setKey} />
        {err ? <Banner kind="danger" text={err} /> : null}
        <Button label="Conectar" icon="🔗" onPress={connect} loading={busy} />
      </Card>
      <Card>
        <H2>Só quero experimentar</H2>
        <T muted>
          O modo demonstração funciona sem internet e sem servidor, com todos os dados de exemplo. Os dados ficam só neste celular
          (não sincroniza com o outro).
        </T>
        <Button label="Testar sem servidor" kind="secondary" icon="🧪" onPress={() => app.configureServer({ mode: 'demo', url: '', anonKey: '' })} style={{ marginTop: 12 }} />
      </Card>
    </Screen>
  );
}
