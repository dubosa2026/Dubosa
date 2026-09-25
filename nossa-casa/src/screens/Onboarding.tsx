import { useState } from 'react';
import { app } from '../data/app';
import { Banner, Button, Card, Field, H2, Screen, T } from '../ui/components';

export function OnboardingScreen() {
  const demo = app.backend?.mode === 'demo';
  const [step, setStep] = useState<'choose' | 'join'>('choose');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(app.error);
  const [code, setCode] = useState('');
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);

  const create = async (who: 'eduardo' | 'jussara') => {
    setBusy(who);
    setErr(null);
    try {
      await app.createHousehold(who);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const lookup = async () => {
    setBusy('lookup');
    setErr(null);
    try {
      const list = await app.inviteMembers(code);
      if (!list.length) setErr('Código inválido ou já utilizado.');
      setOptions(list);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      await app.joinHousehold(code, id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Bem-vindos ao Nossa Casa ❤️" subtitle="Vamos configurar a rotina da família.">
      {err ? <Banner kind="danger" text={err} /> : null}
      {step === 'choose' ? (
        <>
          <Card>
            <H2>{demo ? 'Quem vai usar agora?' : 'Primeira vez? Crie a casa'}</H2>
            <T muted>
              Já deixamos tudo pré-cadastrado: Eduardo e Jussara (administradores, com o mesmo acesso), Inaê e a segunda criança,
              horários, preferências e todas as tarefas. Você revisa em seguida.
            </T>
            <Button label="Sou Eduardo" icon="👨" onPress={() => create('eduardo')} loading={busy === 'eduardo'} style={{ marginTop: 12 }} />
            <Button label="Sou Jussara" icon="👩" onPress={() => create('jussara')} loading={busy === 'jussara'} style={{ marginTop: 8 }} />
          </Card>
          {!demo ? (
            <Card>
              <H2>O outro já criou a casa?</H2>
              <T muted>Peça o código de convite que aparece em Configurações no celular dele(a).</T>
              <Button label="Entrar com código" kind="secondary" icon="🔑" onPress={() => setStep('join')} style={{ marginTop: 12 }} />
            </Card>
          ) : null}
          <Button label={demo ? 'Sair do modo demonstração' : 'Sair'} kind="ghost" small onPress={() => (demo ? app.resetServer() : app.logout())} />
        </>
      ) : (
        <Card>
          <H2>Entrar na casa</H2>
          <Field label="Código de convite" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="ABCD2345" />
          {!options ? <Button label="Continuar" onPress={lookup} loading={busy === 'lookup'} disabled={code.trim().length < 6} /> : null}
          {options?.length ? <T muted>Quem é você?</T> : null}
          {options?.map((o) => (
            <Button key={o.id} label={`Sou ${o.name}`} onPress={() => join(o.id)} loading={busy === o.id} style={{ marginTop: 8 }} />
          ))}
          <Button label="Voltar" kind="ghost" small onPress={() => { setStep('choose'); setOptions(null); }} style={{ marginTop: 12 }} />
        </Card>
      )}
    </Screen>
  );
}
