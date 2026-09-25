import { useState } from 'react';
import { app } from '../data/app';
import { Banner, Button, Card, Field, Screen, Segmented, T } from '../ui/components';

export function LoginScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setMsg(null);
    if (!email.includes('@') || password.length < 6) {
      setMsg({ kind: 'danger', text: 'Informe um e-mail válido e uma senha com pelo menos 6 caracteres.' });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') await app.signIn(email, password);
      else {
        const r = await app.signUp(email, password);
        if (r === 'confirm') setMsg({ kind: 'success', text: 'Conta criada! Abra o e-mail de confirmação e depois volte aqui para entrar.' });
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Nossa Casa ❤️" subtitle="Cada um entra com o próprio login.">
      <Card>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'in', label: 'Entrar' }, { value: 'up', label: 'Criar conta' }]} />
        <Field label="E-mail" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} />
        <Field label="Senha" secureTextEntry textContentType={mode === 'in' ? 'password' : 'newPassword'} value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
        <Button label={mode === 'in' ? 'Entrar' : 'Criar minha conta'} onPress={submit} loading={busy} />
      </Card>
      <T muted center>Só Eduardo e Jussara terão acesso à casa: depois do login, a casa é criada por um e o outro entra com um código de convite.</T>
      <Button label="Trocar servidor" kind="ghost" small onPress={() => app.resetServer()} style={{ marginTop: 24 }} />
    </Screen>
  );
}
