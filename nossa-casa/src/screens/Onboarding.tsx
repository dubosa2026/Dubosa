// Primeira vez depois do login: "Sou Eduardo / Sou Jussara" (quem começa) ou
// "Colar convite" (quem recebeu o convite pelo WhatsApp). Tudo já vem cadastrado.
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { app } from '../data/app';
import { extractInvite } from '../domain/connection';
import { Banner, Button, Card, Field, H2, Screen, T } from '../ui/components';

export function OnboardingScreen() {
  const demo = app.backend?.mode === 'demo';
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(app.error);
  const [code, setCode] = useState(app.pendingInvite ?? '');
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);
  const [showCode, setShowCode] = useState(!!app.pendingInvite);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const lookup = (c: string) =>
    run('lookup', async () => {
      const list = await app.inviteMembers(c);
      if (!list.length) throw new Error('Convite inválido ou já usado. Peça para gerar um novo em Configurações.');
      setOptions(list);
    });

  // Veio pelo link do convite: já procura quem pode entrar.
  useEffect(() => {
    if (app.pendingInvite) void lookup(app.pendingInvite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    const c = extractInvite(text);
    if (!c) {
      setShowCode(true);
      setErr('Não achei o convite no que foi copiado. Copie a mensagem do WhatsApp (segure o dedo nela → Copiar) ou digite o código.');
      return;
    }
    setCode(c);
    setShowCode(true);
    await lookup(c);
  };

  const create = (who: 'eduardo' | 'jussara') =>
    run(who, async () => {
      try {
        await app.createHousehold(who);
      } catch (e) {
        if (/já existe uma casa/i.test((e as Error).message)) {
          setShowCode(true);
          throw new Error('A casa já foi criada no outro celular. Toque em "Colar convite" com a mensagem que ele(a) mandou.');
        }
        throw e;
      }
    });

  return (
    <Screen title="Bem-vindos ao Nossa Casa ❤️" subtitle="Um toque e está pronto.">
      {err ? <Banner kind="danger" text={err} /> : null}
      {!demo ? (
        <Card>
          <H2>Recebeu o convite no WhatsApp?</H2>
          <T muted>Copie a mensagem (segure o dedo nela → Copiar) e toque aqui:</T>
          <Button label="Colar convite" icon="📋" onPress={paste} loading={busy === 'lookup'} style={{ marginTop: 10 }} />
          {showCode ? (
            <>
              <Field label="Código do convite" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={(t) => setCode(t.toUpperCase().trim())} placeholder="ABCD2345" />
              {!options ? <Button small kind="secondary" label="Continuar" onPress={() => lookup(code)} disabled={code.length < 6} /> : null}
            </>
          ) : (
            <Button small kind="ghost" label="Prefiro digitar o código" onPress={() => setShowCode(true)} style={{ marginTop: 6 }} />
          )}
          {options?.map((o) => (
            <Button key={o.id} label={`Sou ${o.name}`} onPress={() => run(o.id, () => app.joinHousehold(code, o.id))} loading={busy === o.id} style={{ marginTop: 8 }} />
          ))}
        </Card>
      ) : null}
      {!options ? (
        <Card>
          <H2>{demo ? 'Quem vai usar agora?' : 'Primeira vez da família?'}</H2>
          <T muted>
            {demo
              ? 'Tudo já vem cadastrado.'
              : 'Quem começa toca no próprio nome. Tudo já vem cadastrado (pessoas, horários, tarefas e regras) e depois você manda o convite para o outro celular.'}
          </T>
          <Button label="Sou Eduardo" icon="👨" onPress={() => create('eduardo')} loading={busy === 'eduardo'} style={{ marginTop: 12 }} />
          <Button label="Sou Jussara" icon="👩" onPress={() => create('jussara')} loading={busy === 'jussara'} style={{ marginTop: 8 }} />
        </Card>
      ) : null}
      <Button label={demo ? 'Sair do modo demonstração' : 'Sair'} kind="ghost" small onPress={() => (demo ? app.resetServer() : app.logout())} />
    </Screen>
  );
}
