// HOJE — "O que precisamos fazer hoje?"
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { addDays, formatLong, formatShort, isWeekend, weekday } from '@/src/domain/dates';
import { estimateSuggestions, postponeSuggestions } from '@/src/domain/insights';
import { Avatar, Banner, Button, Card, Empty, H2, Progress, Row, Screen, T, TaskRow } from '@/src/ui/components';
import { byTime, isLate, sortTasks, useAdults, useDayTimes, useKids, useToday, visible } from '@/src/ui/selectors';
import { SyncBadge } from '@/src/ui/SyncBadge';
import { useColors } from '@/src/ui/theme';

export default function Today() {
  const c = useColors();
  const today = useToday();
  const times = useDayTimes(today);
  const timesTomorrow = useDayTimes(addDays(today, 1));
  const instances = useNC((s) => s.instances);
  const templates = useNC((s) => s.templates);
  const logs = useNC((s) => s.logs);
  const events = useNC((s) => s.events);
  const dismissed = useNC((s) => s.dismissed);
  const members = useNC((s) => s.members);
  const meId = useNC((s) => s.meId);
  const gamification = useNC((s) => s.household?.settings.gamification ?? true);
  const adults = useAdults();
  const kids = useKids();

  const live = useMemo(() => instances.filter(visible), [instances]);
  const todays = live.filter((i) => i.date === today);
  const late = live.filter((i) => isLate(i, today) && i.kind !== 'mission' && i.kind !== 'coverage' && i.date >= addDays(today, -14));
  const tomorrow = live.filter((i) => i.date === addDays(today, 1) && i.kind !== 'mission');
  const adultTasks = todays.filter((i) => i.kind !== 'mission');
  const done = adultTasks.filter((i) => i.status === 'done').length;
  const suggestions = useMemo(
    () => [...postponeSuggestions(templates, instances, logs, today, dismissed), ...estimateSuggestions(templates, instances, dismissed)].slice(0, 2),
    [templates, instances, logs, today, dismissed],
  );
  const todayEvents = events.filter((e) => !e.deleted && e.date === today);
  const weekendOuting = events.some((e) => !e.deleted && e.type === 'outing' && isWeekend(e.date) && e.date >= today && e.date <= addDays(today, 7 - weekday(today)));
  const open = (id: string) => router.push({ pathname: '/tarefa/[id]', params: { id } });
  const inviteCode = useNC((s) => s.household?.invite_code);
  const pendingAdult = adults.find((a) => a.id !== meId && !a.user_id);
  const inviteFor = app.backend?.mode === 'cloud' && inviteCode && pendingAdult ? pendingAdult.name : null;
  const order = [...adults].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.sort - b.sort));

  return (
    <Screen title="O que precisamos fazer hoje?" subtitle={formatLong(today)} right={<SyncBadge />}>
      <Row style={{ marginBottom: 12 }}>
        <Stat label="pendentes" value={adultTasks.length - done} color={c.warn} />
        <Stat label="concluídas" value={done} color={c.success} />
        <Stat label="atrasadas" value={late.length} color={c.danger} />
      </Row>

      {inviteFor ? (
        <Banner kind="info" text={`Falta ${inviteFor} entrar no app. Mande o convite pelo WhatsApp — é só tocar abaixo.`}>
          <Button label={`Enviar convite para ${inviteFor}`} icon="📤" onPress={() => {
            const message = app.connectionMessage();
            if (message) void Share.share({ message });
          }} />
        </Banner>
      ) : null}

      {suggestions.map((s) => (
        <Banner key={`${s.kind}:${s.template.id}`} kind="warn" text={s.message}>
          <Row wrap>
            {s.kind === 'postponed' ? (
              <>
                <Button small kind="secondary" label="Aumentar intervalo" onPress={() => app.actions.relaxTemplate(s.template.id)} />
                <Button small kind="secondary" label="Alterar responsável" onPress={() => router.push({ pathname: '/modelo/[id]', params: { id: s.template.id } })} />
              </>
            ) : (
              <Button small kind="secondary" label={`Usar ${s.actualMinutes} min`} onPress={() => app.actions.updateEstimate(s.template.id, s.actualMinutes)} />
            )}
            <Button small kind="ghost" label="Agora não" onPress={() => app.actions.dismiss(`${s.kind}:${s.template.id}`)} />
          </Row>
        </Banner>
      ))}

      {order.map((a) => {
        const mine = adultTasks.filter((i) => i.assignee_ids.includes(a.id)).sort(byTime(times));
        const d = mine.filter((i) => i.status === 'done').length;
        return (
          <Card key={a.id}>
            <Row style={{ marginBottom: 4 }}>
              <Avatar member={a} />
              <View style={{ flex: 1 }}>
                <T bold size="title">{a.name}{a.id === meId ? ' (você)' : ''}</T>
                <T muted size="small">{mine.length ? `${d} de ${mine.length} feitas` : 'Dia livre de tarefas'}</T>
              </View>
            </Row>
            {mine.length ? <Progress value={d / mine.length} color={a.color} /> : null}
            {mine.map((i) => <TaskRow key={i.id} task={i} members={members} time={times.get(i.id)} onToggle={() => app.actions.toggle(i.id)} onPress={() => open(i.id)} />)}
            {!mine.length ? <Empty emoji="🌿" text="Nada para hoje. Aproveite para descansar." /> : null}
          </Card>
        );
      })}

      <Card>
        <Pressable onPress={() => router.push('/criancas')}>
          <H2 right={<T muted size="small">ver missões ›</T>}>🧸 Crianças</H2>
        </Pressable>
        {kids.map((k) => {
          const m = todays.filter((i) => i.kind === 'mission' && i.assignee_ids.includes(k.id)).sort(sortTasks);
          if (!m.length) return null;
          const dn = m.filter((i) => i.status === 'done');
          return (
            <View key={k.id} style={{ marginBottom: 8 }}>
              <Row>
                <Avatar member={k} size={30} />
                <T bold>{k.name}</T>
                <T muted size="small">
                  {dn.length}/{m.length} missões{gamification ? ` · ⭐ ${dn.reduce((s, i) => s + (i.points || 1), 0)}` : ''}
                </T>
              </Row>
              {m.map((i) => <TaskRow key={i.id} task={i} members={members} compact onToggle={() => app.actions.toggle(i.id)} onPress={() => open(i.id)} />)}
            </View>
          );
        })}
        {!todays.some((i) => i.kind === 'mission') ? <Empty emoji="🧸" text="Sem missões hoje." /> : null}
      </Card>

      <Card tint={c.soft}>
        <Pressable onPress={() => router.push('/familia')}>
          <H2 right={<T muted size="small">abrir ›</T>}>❤️ Família</H2>
        </Pressable>
        {todayEvents.map((e) => (
          <Row key={e.id} style={{ paddingVertical: 6 }}>
            <Text style={{ fontSize: 22 }}>{e.type === 'outing' ? '❤️' : '📅'}</Text>
            <T bold>{e.title}{e.time ? ` · ${e.time}` : ''}</T>
          </Row>
        ))}
        {!todayEvents.length ? (
          <T muted>
            {weekendOuting ? 'Passeio do fim de semana já está combinado. 💚' : 'Ainda sem passeio no fim de semana. Que tal planejar um tempo em família?'}
          </T>
        ) : null}
      </Card>

      {late.length ? (
        <Card>
          <H2 right={<Button small kind="secondary" label="Reorganizar" onPress={() => router.push('/reorganizar')} />}>⚠️ Atrasadas</H2>
          {late.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8).map((i) => (
            <TaskRow key={i.id} task={i} members={members} showWho late onToggle={() => app.actions.toggle(i.id)} onPress={() => open(i.id)} />
          ))}
          {late.length > 8 ? <T muted size="small">+ {late.length - 8} outras</T> : null}
        </Card>
      ) : null}

      {tomorrow.length ? (
        <Card>
          <H2>Próximas · {formatShort(addDays(today, 1))}</H2>
          {tomorrow.sort(byTime(timesTomorrow)).slice(0, 6).map((i) => (
            <TaskRow key={i.id} task={i} members={members} showWho time={timesTomorrow.get(i.id)} onToggle={() => app.actions.toggle(i.id)} onPress={() => open(i.id)} />
          ))}
          {tomorrow.length > 6 ? <T muted size="small">+ {tomorrow.length - 6} tarefas — veja na aba Semana</T> : null}
        </Card>
      ) : null}

      <Row>
        <Button label="Nova tarefa" icon="➕" onPress={() => router.push('/nova')} style={{ flex: 1 }} />
        <Button label="Mercado" icon="🛒" kind="secondary" onPress={() => router.push('/mercado')} style={{ flex: 1 }} />
      </Row>
      <Button label="Perguntar à Nossa Casa IA" icon="💬" kind="secondary" onPress={() => router.push('/assistente')} style={{ marginTop: 8 }} />
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: c.border }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 13, color: c.muted }}>{label}</Text>
    </View>
  );
}
