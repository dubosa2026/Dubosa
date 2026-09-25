import { useState } from 'react';
import { app } from '../data/app';
import { BUILT_IN } from '../data/config';
import { toLoginEmail } from '../domain/login';
import { Banner, Button, Card, Field, Screen, Segmented, T } from '../ui/components';

export function LoginScreen() {
  const [mode, setMode] = useState<'up' | 'in'>('up');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setMsg(null);
    const email = toLoginEmail(user);
    if (!email || password.length < 6) {
      setMsg({ kind: 'danger', text: 'Escolha um usuário (pelo menos 3 letras, ex.: eduardo) e uma senha com pelo menos 6 caracteres.' });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') await app.signIn(email, password);
      else {
        const r = await app.signUp(email, password);
        if (r === 'confirm') setMsg({ kind: 'success', text: 'Conta criada! Falta confirmar: no Supabase, desligue "Confirm email" (ou confirme pelo e-mail) e entre de novo.' });
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Nossa Casa ❤️" subtitle={mode === 'up' ? 'Crie seu usuário — leva 10 segundos.' : 'Entre com seu usuário.'}>
      <Card>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'up', label: 'Primeira vez' }, { value: 'in', label: 'Já tenho usuário' }]} />
        <Field label="Usuário" placeholder="ex.: eduardo" autoCapitalize="none" autoCorrect={false} textContentType="username" value={user} onChangeText={setUser} />
        <Field label="Senha" secureTextEntry textContentType={mode === 'in' ? 'password' : 'newPassword'} value={password} onChangeText={setPassword} onSubmitEditing={submit} hint={mode === 'up' ? 'Pelo menos 6 caracteres. Guarde bem: é com ela que você entra de novo.' : undefined} />
        {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
        <Button label={mode === 'in' ? 'Entrar' : 'Criar e entrar'} onPress={submit} loading={busy} />
      </Card>
      <T muted center>Cada um tem seu próprio usuário. Só Eduardo e Jussara têm acesso à casa.</T>
      {!BUILT_IN ? <Button label="Trocar servidor" kind="ghost" small onPress={() => app.resetServer()} style={{ marginTop: 24 }} /> : null}
    </Screen>
  );
}
