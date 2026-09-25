// CONFIGURAÇÕES — nada de regras "presas" ao código: tudo é ajustável aqui.
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, Share, Switch, View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { BUILT_IN } from '@/src/data/config';
import { sendTestNotification } from '@/src/data/notifications';
import { displayUser } from '@/src/domain/login';
import { formatShort, WEEKDAY_SHORT } from '@/src/domain/dates';
import type { NotificationSettings, Weekday } from '@/src/domain/types';
import { Avatar, Banner, Button, Card, Chip, Field, H2, Row, Screen, T } from '@/src/ui/components';
import { Stepper } from '@/src/ui/ScheduleEditor';
import { useAdults, useKids } from '@/src/ui/selectors';
import { useColors } from '@/src/ui/theme';

export default function Settings() {
  const c = useColors();
  const household = useNC((s) => s.household)!;
  const meId = useNC((s) => s.meId);
  const sync = useNC((s) => s.sync);
  const adults = useAdults();
  const kids = useKids();
  const s = household.settings;
  const n = s.notifications;
  const cloud = app.backend?.mode === 'cloud';
  const [childName, setChildName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const setN = (patch: Partial<NotificationSettings>) => app.actions.updateSettings({ notifications: { ...n, ...patch } });

  const confirm = (title: string, text: string, fn: () => void) => {
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${text}`)) fn();
      return;
    }
    Alert.alert(title, text, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', style: 'destructive', onPress: fn }]);
  };

  return (
    <Screen title="Configurações">
      <Card>
        <H2>Conta</H2>
        {cloud ? <T>Conectado como {displayUser(app.email)}</T> : <T>🧪 Modo demonstração (dados só neste celular)</T>}
        <T muted>Você é: {adults.find((a) => a.id === meId)?.name ?? '—'} · administrador(a)</T>
        {cloud ? (
          <>
            <T muted size="small">
              {sync.online ? 'Online' : 'Sem internet'} · {sync.pending} alteração(ões) para enviar ·{' '}
              {sync.realtime ? 'tempo real ativo' : 'tempo real desligado'}
              {sync.lastSync ? ` · última sincronização ${new Date(sync.lastSync).toLocaleTimeString()}` : ''}
            </T>
            {sync.error ? <Banner kind="warn" text={sync.error} /> : null}
            <Button small kind="secondary" label="Sincronizar agora" icon="🔄" onPress={() => void app.refresh()} style={{ marginTop: 8 }} />
          </>
        ) : (
          <>
            <T muted size="small">Para simular os dois celulares, troque de pessoa:</T>
            <Row wrap style={{ marginTop: 6 }}>
              {adults.map((a) => <Chip key={a.id} label={`${a.emoji} ${a.name}`} selected={a.id === meId} color={a.color} onPress={() => app.switchDemoPerson(a.id)} />)}
            </Row>
          </>
        )}
      </Card>

      {cloud ? (
        <Card>
          <H2>Acesso da família</H2>
          {household.invite_code ? (
            <>
              <T>Código de convite para o outro celular:</T>
              <T size="huge" bold>{household.invite_code}</T>
              <T muted size="small">No outro celular: criar conta → “Entrar com código”. O código deixa de valer quando os dois adultos estiverem conectados.</T>
            </>
          ) : (
            <T muted>Eduardo e Jussara já estão conectados. Nenhum outro login tem acesso à casa.</T>
          )}
          <Button label="Enviar convite para o outro celular" icon="📤" onPress={() => {
            const message = app.connectionMessage();
            if (message) void Share.share({ message });
          }} style={{ marginTop: 10 }} />
          <T muted size="small">Manda pelo WhatsApp o link do app, a conexão com o servidor e o código — é só colar no outro celular.</T>
          <Button small kind="ghost" label="Gerar novo código (troca de celular)" onPress={async () => {
            try {
              const code = await app.renewInvite();
              setMsg(`Novo código: ${code}`);
            } catch (e) {
              setMsg((e as Error).message);
            }
          }} style={{ marginTop: 8 }} />
          {msg ? <Banner kind="info" text={msg} /> : null}
        </Card>
      ) : null}

      <Card>
        <H2>Moradores</H2>
        {[...adults, ...kids].map((m) => (
          <Pressable key={m.id} onPress={() => router.push({ pathname: '/membro/[id]', params: { id: m.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <Avatar member={m} />
            <View style={{ flex: 1 }}>
              <T bold>{m.name}</T>
              <T muted size="small">{m.kind === 'adult' ? 'Administrador(a) · horários e preferências' : `Criança${m.age ? ` · ${m.age} anos` : ''}`}</T>
            </View>
            <T muted>›</T>
          </Pressable>
        ))}
        <Row style={{ marginTop: 8 }}>
          <View style={{ flex: 1 }}><Field label="Adicionar criança" value={childName} onChangeText={setChildName} placeholder="Nome" /></View>
          <Button small label="Adicionar" onPress={() => { app.actions.addChild(childName, null); setChildName(''); }} disabled={!childName.trim()} />
        </Row>
      </Card>

      <Card>
        <H2>Divisão justa</H2>
        <T muted>Horários de cada um, dias leves, limite do fim de semana, descanso e a meta de divisão.</T>
        <Button kind="secondary" label="Horários e divisão" icon="⚖️" onPress={() => router.push('/disponibilidade')} style={{ marginTop: 8 }} />
        <Button kind="ghost" small label="Revisar configuração inicial (nomes, crianças, horários…)" onPress={() => app.actions.updateSettings({ onboarding_done: false })} style={{ marginTop: 8 }} />
      </Card>

      <Card>
        <H2>Crianças</H2>
        <Toggle label="⭐ Pontos, 🏆 conquistas e 🎯 metas semanais" value={s.gamification} onChange={(v) => app.actions.updateSettings({ gamification: v })} />
        {s.gamification ? kids.map((k) => (
          <Row key={k.id} style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <T>🎯 Meta semanal de {k.name}</T>
            <Stepper value={s.weekly_goal_points[k.id] ?? 20} step={5} suffix="⭐" onChange={(v) => app.actions.updateSettings({ weekly_goal_points: { ...s.weekly_goal_points, [k.id]: v } })} />
          </Row>
        )) : null}
      </Card>

      <Card>
        <H2>Notificações</H2>
        <Toggle label="Ativar notificações" value={n.enabled} onChange={(v) => setN({ enabled: v })} />
        {n.enabled ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}><T>Antecedência</T><Stepper value={n.lead_minutes} step={5} max={120} onChange={(v) => setN({ lead_minutes: v })} /></Row>
            <TimeField label="Resumo do dia" value={n.daily_summary_time} onChange={(v) => setN({ daily_summary_time: v })} />
            <TimeField label="Lembrete de pendências" value={n.overdue_time} onChange={(v) => setN({ overdue_time: v })} />
            <T muted size="small">Dias da semana</T>
            <Row wrap>
              {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => (
                <Chip key={d} label={WEEKDAY_SHORT[d]} selected={n.weekdays.includes(d)} onPress={() => setN({ weekdays: n.weekdays.includes(d) ? n.weekdays.filter((x) => x !== d) : [...n.weekdays, d] })} />
              ))}
            </Row>
            <Toggle label="🛒 Mercado" value={n.categories.market} onChange={(v) => setN({ categories: { ...n.categories, market: v } })} />
            <Toggle label="📚 Lição da Inaê" value={n.categories.homework} onChange={(v) => setN({ categories: { ...n.categories, homework: v } })} />
            <Toggle label="❤️ Passeios" value={n.categories.outing} onChange={(v) => setN({ categories: { ...n.categories, outing: v } })} />
            <Toggle label="👕 Roupas" value={n.categories.clothes} onChange={(v) => setN({ categories: { ...n.categories, clothes: v } })} />
            <Toggle label="🔁 Tarefas recorrentes" value={n.categories.recurring} onChange={(v) => setN({ categories: { ...n.categories, recurring: v } })} />
            <Toggle label="Avisar quando o outro concluir/alterar algo" value={n.partner_changes} onChange={(v) => setN({ partner_changes: v })} />
            <Button small kind="secondary" label="Enviar notificação de teste" icon="🔔" onPress={async () => setMsg((await sendTestNotification()) ? 'Notificação de teste chega em 3 segundos.' : 'Permita as notificações nas configurações do Android.')} style={{ marginTop: 8 }} />
          </>
        ) : null}
      </Card>

      {cloud ? (
        <Card>
          <H2>Nossa Casa IA</H2>
          <Toggle label="Usar IA na nuvem para perguntas livres" value={s.ai_enabled} onChange={(v) => app.actions.updateSettings({ ai_enabled: v })} />
          <T muted size="small">Requer a função “assistant” publicada no Supabase com a chave da Anthropic (veja o README). Sem ela, o assistente responde localmente.</T>
        </Card>
      ) : null}

      <Card>
        <H2>Sobre</H2>
        <T muted size="small">Nossa Casa 1.0 · casa criada em {formatShort(household.created_at.slice(0, 10))}</T>
        <Button kind="danger" label={cloud ? 'Sair (logout)' : 'Sair do modo demonstração'} onPress={() => confirm('Sair', cloud ? 'Os dados continuam salvos no servidor.' : 'Os dados de demonstração deste celular serão apagados.', () => void (cloud ? app.logout() : app.resetServer()))} style={{ marginTop: 12 }} />
        {cloud && !BUILT_IN ? <Button small kind="ghost" label="Trocar servidor" onPress={() => confirm('Trocar servidor', 'Você sairá da conta neste celular.', () => void app.resetServer())} style={{ marginTop: 8 }} /> : null}
      </Card>
      <View style={{ height: 1, backgroundColor: c.border }} />
    </Screen>
  );
}

export function Toggle({ label, value, onChange }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1 }}><T>{label}</T></View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={typeof label === 'string' ? label : undefined} />
    </Row>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Field
      label={label}
      value={v}
      onChangeText={setV}
      keyboardType="numbers-and-punctuation"
      onEndEditing={() => (/^\d{2}:\d{2}$/.test(v) ? onChange(v) : setV(value))}
      hint="Formato HH:MM"
    />
  );
}
