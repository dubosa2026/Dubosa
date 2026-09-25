// SEMANA — calendário (dia / semana / mês), equilíbrio e "Reorganizar minha semana".
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { weekBalance } from '@/src/domain/balance';
import {
  addDays, formatLong, formatMinutes, formatShort, fromISO, MONTH_NAMES, monthDates, weekDates, weekStart, weekday, WEEKDAY_SHORT,
} from '@/src/domain/dates';
import { Avatar, Banner, Button, Card, Chip, Empty, H2, Progress, Row, Screen, Segmented, T, TaskRow } from '@/src/ui/components';
import { sortTasks, useAdults, useKids, useToday, visible } from '@/src/ui/selectors';
import { useColors } from '@/src/ui/theme';

type View_ = 'day' | 'week' | 'month';

export default function Week() {
  const c = useColors();
  const today = useToday();
  const [mode, setMode] = useState<View_>('week');
  const [date, setDate] = useState(today);
  const [who, setWho] = useState<string>('all');
  const instances = useNC((s) => s.instances);
  const events = useNC((s) => s.events);
  const members = useNC((s) => s.members);
  const household = useNC((s) => s.household)!;
  const adults = useAdults();
  const kids = useKids();

  const live = useMemo(() => instances.filter(visible), [instances]);
  const filter = (i: (typeof live)[number]) =>
    who === 'all' ? true : who === 'kids' ? i.kind === 'mission' : i.assignee_ids.includes(who) && i.kind !== 'mission';
  const ws = weekStart(date);
  const balance = useMemo(() => weekBalance(instances, members, household, ws), [instances, members, household, ws]);
  const open = (id: string) => router.push({ pathname: '/tarefa/[id]', params: { id } });
  const shift = (n: number) => setDate(mode === 'month' ? toISOAddMonths(date, n) : addDays(date, mode === 'day' ? n : 7 * n));

  const dayEvents = (d: string) => events.filter((e) => !e.deleted && e.date === d);
  const header =
    mode === 'day' ? formatLong(date) : mode === 'week' ? `${formatShort(ws)} a ${formatShort(addDays(ws, 6))}` : `${MONTH_NAMES[fromISO(date).getMonth()]} ${fromISO(date).getFullYear()}`;

  return (
    <Screen title="Semana" subtitle="Calendário da família">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }]} />
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Button small kind="secondary" label="‹" onPress={() => shift(-1)} />
        <Pressable onPress={() => setDate(today)}><T bold>{header}</T></Pressable>
        <Button small kind="secondary" label="›" onPress={() => shift(1)} />
      </Row>
      <Row wrap style={{ marginBottom: 8 }}>
        <Chip label="Todos" selected={who === 'all'} onPress={() => setWho('all')} />
        {adults.map((a) => <Chip key={a.id} label={`${a.emoji} ${a.name}`} selected={who === a.id} color={a.color} onPress={() => setWho(a.id)} />)}
        <Chip label="🧸 Crianças" selected={who === 'kids'} onPress={() => setWho('kids')} />
      </Row>

      {mode !== 'month' ? (
        <Card>
          <H2>⚖️ Equilíbrio da semana</H2>
          {balance.members.map((m) => (
            <View key={m.member.id} style={{ marginBottom: 10 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row><Avatar member={m.member} size={28} /><T bold>{m.member.name}</T></Row>
                <T>{formatMinutes(m.minutes)} de tarefas</T>
              </Row>
              <Progress value={m.actualShare} color={m.member.color} />
              {m.coverage ? <T muted size="small">+ {formatMinutes(m.coverage)} cuidando das crianças enquanto o outro faz tarefas</T> : null}
            </View>
          ))}
          <Banner kind={balance.balanced ? 'success' : 'warn'} text={`${balance.title}. ${balance.message}`} />
          <T muted size="small">Considera tempo e esforço de cada tarefa, incluindo o cuidado com as crianças. Não é competição. 💚</T>
        </Card>
      ) : null}

      <Button label="REORGANIZAR MINHA SEMANA" icon="🔄" onPress={() => router.push('/reorganizar')} style={{ marginBottom: 12 }} />

      {mode === 'day' ? (
        <DayView date={date} />
      ) : mode === 'week' ? (
        weekDates(ws).map((d) => {
          const list = live.filter((i) => i.date === d && filter(i) && (who !== 'all' || i.kind !== 'mission')).sort(sortTasks);
          const ev = dayEvents(d);
          const missions = live.filter((i) => i.date === d && i.kind === 'mission');
          return (
            <Card key={d} tint={d === today ? c.soft : undefined}>
              <Pressable onPress={() => { setDate(d); setMode('day'); }}>
                <H2 right={<T muted size="small">{list.filter((i) => i.status === 'done').length}/{list.length}</T>}>
                  {d === today ? 'Hoje · ' : ''}{formatShort(d)}{weekday(d) === 3 ? ' · dia leve' : ''}
                </H2>
              </Pressable>
              {ev.map((e) => <T key={e.id}>{e.type === 'outing' ? '❤️' : '📅'} {e.title}{e.time ? ` · ${e.time}` : ''}</T>)}
              {list.map((i) => <TaskRow key={i.id} task={i} members={members} showWho={who === 'all' || who === 'kids'} compact onToggle={() => app.actions.toggle(i.id)} onPress={() => open(i.id)} />)}
              {who === 'all' && missions.length ? <T muted size="small">🧸 {missions.filter((i) => i.status === 'done').length}/{missions.length} missões das crianças</T> : null}
              {!list.length && !ev.length ? <T muted>Livre 🌿</T> : null}
            </Card>
          );
        })
      ) : (
        <MonthView date={date} onPick={(d) => { setDate(d); setMode('day'); }} filter={filter} />
      )}
      {kids.length ? null : null}
    </Screen>
  );
}

function DayView({ date }: { date: string }) {
  const instances = useNC((s) => s.instances);
  const members = useNC((s) => s.members);
  const events = useNC((s) => s.events);
  const adults = useAdults();
  const kids = useKids();
  const list = instances.filter((i) => visible(i) && i.date === date);
  const open = (id: string) => router.push({ pathname: '/tarefa/[id]', params: { id } });
  return (
    <>
      {events.filter((e) => !e.deleted && e.date === date).map((e) => (
        <Card key={e.id}><T bold>{e.type === 'outing' ? '❤️' : '📅'} {e.title}{e.time ? ` · ${e.time}` : ''}</T></Card>
      ))}
      {[...adults, ...kids].map((m) => {
        const mine = list.filter((i) => i.assignee_ids.includes(m.id)).sort(sortTasks);
        if (!mine.length) return null;
        return (
          <Card key={m.id}>
            <Row><Avatar member={m} size={30} /><T bold size="title">{m.name}</T></Row>
            {mine.map((i) => <TaskRow key={i.id} task={i} members={members} onToggle={() => app.actions.toggle(i.id)} onPress={() => open(i.id)} />)}
          </Card>
        );
      })}
      {!list.length ? <Empty emoji="🌿" text="Nenhuma tarefa neste dia." /> : null}
    </>
  );
}

function MonthView({ date, onPick, filter }: { date: string; onPick: (d: string) => void; filter: (i: never) => boolean }) {
  const c = useColors();
  const today = useToday();
  const instances = useNC((s) => s.instances);
  const events = useNC((s) => s.events);
  const days = monthDates(date);
  const pad = (weekday(days[0]) + 6) % 7;
  const cells: (string | null)[] = [...Array(pad).fill(null), ...days];
  return (
    <Card>
      <Row>
        {[1, 2, 3, 4, 5, 6, 0].map((w) => <Text key={w} style={{ flex: 1, textAlign: 'center', color: c.muted, fontWeight: '700' }}>{WEEKDAY_SHORT[w]}</Text>)}
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, idx) => {
          if (!d) return <View key={`e${idx}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const list = instances.filter((i) => visible(i) && i.date === d && i.kind !== 'mission' && (filter as (i: unknown) => boolean)(i));
          const pending = list.filter((i) => i.status === 'pending').length;
          const hasEvent = events.some((e) => !e.deleted && e.date === d);
          return (
            <Pressable key={d} onPress={() => onPick(d)} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <View style={{ flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: d === today ? c.primary : c.soft }}>
                <Text style={{ color: d === today ? '#fff' : c.text, fontWeight: '700' }}>{fromISO(d).getDate()}</Text>
                <Text style={{ fontSize: 10, color: d === today ? '#fff' : c.muted }}>{list.length ? `${list.length - pending}/${list.length}` : ''}{hasEvent ? ' ❤️' : ''}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function toISOAddMonths(d: string, n: number) {
  const x = fromISO(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`;
}
