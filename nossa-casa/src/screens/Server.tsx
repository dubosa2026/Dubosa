import { useState } from 'react';
import { app } from '../data/app';
import { APP_VERSION, validateBackend } from '../data/config';
import { decodeConnection } from '../domain/connection';
import { Banner, Button, Card, Field, H2, Screen, T } from '../ui/components';

export function ServerScreen() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');

  const applyPasted = async () => {
    const info = decodeConnection(pasted);
    if (!info) {
      setErr('Não reconheci o código. Cole a mensagem inteira que o outro celular enviou.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await app.applyConnection(info);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
      {err ? <Banner kind="danger" text={err} /> : null}
      <T muted size="small">Nossa Casa {APP_VERSION}</T>
      <Card>
        <H2>Recebeu um código do outro celular?</H2>
        <T muted>Cole aqui a mensagem que chegou (pode colar ela inteira).</T>
        <Field label="Código de conexão" placeholder="NC1-..." autoCapitalize="none" autoCorrect={false} multiline value={pasted} onChangeText={setPasted} />
        <Button label="Colar código de conexão" icon="📋" onPress={applyPasted} loading={busy && !!pasted} disabled={!pasted.trim()} />
      </Card>
      <Card>
        <H2>Conectar ao servidor da família</H2>
        <T muted>
          Para Eduardo e Jussara verem as mesmas tarefas em tempo real, o app usa um banco de dados gratuito no Supabase.
          Cole abaixo os dados do projeto (Project Settings → API). Só precisa fazer isso uma vez em cada celular.
        </T>
        <Field label="URL do projeto" placeholder="https://xxxxxxxx.supabase.co" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={url} onChangeText={setUrl} />
        <Field label="Chave pública (anon / publishable key)" placeholder="eyJhbGciOi..." autoCapitalize="none" autoCorrect={false} value={key} onChangeText={setKey} />
        <Button label="Conectar" icon="🔗" onPress={connect} loading={busy && !pasted} />
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
