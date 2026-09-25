// Análise da carga horária disponível + regras da divisão justa (tudo configurável).
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { weekBalance } from '@/src/domain/balance';
import { formatMinutes, timeToMinutes, weekStart, WEEKDAY_SHORT } from '@/src/domain/dates';
import { dayCapacity } from '@/src/domain/planner';
import type { Member, Weekday } from '@/src/domain/types';
import { Avatar, Banner, Card, Chip, H2, Row, Screen, T } from '@/src/ui/components';
import { ScheduleEditor, Stepper } from '@/src/ui/ScheduleEditor';
import { useAdults, useToday } from '@/src/ui/selectors';

export default function Availability() {
  const today = useToday();
  const household = useNC((s) => s.household)!;
  const instances = useNC((s) => s.instances);
  const members = useNC((s) => s.members);
  const adults = useAdults();
  const s = household.settings;
  const [who, setWho] = useState(0);
  const balance = useMemo(() => weekBalance(instances, members, household, weekStart(today)), [instances, members, household, today]);
  const upd = app.actions.updateSettings.bind(app.actions);
  const first = adults[0];
  const firstShare = Math.round((s.target_share[first?.id] ?? 0.5) * 100);

  return (
    <Screen>
      <Card>
        <H2>Análise da carga horária</H2>
        <T muted size="small">
          Não presumimos que “quem fica mais em casa faz mais”, nem que “quem trabalha fora não faz”. O app soma tarefas, cuidado com as
          crianças e rotina, respeita quando cada um está em casa e preserva descanso.
        </T>
        {adults.map((a) => <Analysis key={a.id} member={a} />)}
        {balance.members.map((m) => (
          <T key={m.member.id} size="small">Esta semana, {m.member.name}: {formatMinutes(m.minutes)} de tarefas ({Math.round(m.actualShare * 100)}% da carga ponderada)</T>
        ))}
      </Card>

      <Card>
        <H2>Meta de divisão</H2>
        <T muted size="small">Quanto da carga doméstica total (inclui crianças) cada um deve assumir. Padrão: metade para cada um.</T>
        {first && adults[1] ? (
          <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <T>{first.name} {firstShare}% · {adults[1].name} {100 - firstShare}%</T>
            <Stepper value={firstShare} step={5} min={20} max={80} suffix="%" onChange={(v) => upd({ target_share: { [first.id]: v / 100, [adults[1].id]: 1 - v / 100 } })} />
          </Row>
        ) : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <T>Reserva de descanso</T>
          <Stepper value={Math.round(s.rest_reserve * 100)} step={5} min={0} max={60} suffix="%" onChange={(v) => upd({ rest_reserve: v / 100 })} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <T>Extras por dia no fim de semana</T>
          <Stepper value={s.weekend_max_minutes} step={15} min={0} max={240} onChange={(v) => upd({ weekend_max_minutes: v })} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <T>Cobertura das crianças a partir de</T>
          <Stepper value={s.coverage_min_minutes} step={5} min={10} max={120} onChange={(v) => upd({ coverage_min_minutes: v })} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <T>Cobertura conta como carga</T>
          <Stepper value={Math.round(s.coverage_load_factor * 100)} step={25} min={0} max={100} suffix="%" onChange={(v) => upd({ coverage_load_factor: v / 100 })} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <T>Diferença aceitável</T>
          <Stepper value={s.balance_tolerance} step={2} min={4} max={40} suffix="%" onChange={(v) => upd({ balance_tolerance: v })} />
        </Row>
        <T muted size="small">Dias leves (sem tarefas pesadas):</T>
        <Row wrap>
          {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => (
            <Chip key={d} label={WEEKDAY_SHORT[d]} selected={s.light_days.includes(d)} onPress={() => upd({ light_days: s.light_days.includes(d) ? s.light_days.filter((x) => x !== d) : [...s.light_days, d] })} />
          ))}
        </Row>
        <Banner kind="info" text="Depois de mudar, use “Reorganizar minha semana” para aplicar nas tarefas futuras." />
      </Card>

      <Card>
        <H2>Horários de cada um</H2>
        <Row wrap>{adults.map((a, i) => <Chip key={a.id} label={`${a.emoji} ${a.name}`} color={a.color} selected={who === i} onPress={() => setWho(i)} />)}</Row>
        {adults[who] ? <ScheduleEditor member={adults[who]} /> : null}
      </Card>
    </Screen>
  );
}

function Analysis({ member }: { member: Member }) {
  const household = useNC((s) => s.household)!;
  const sched = member.schedule ?? [];
  const homeMin = sched.reduce((acc, d) => acc + d.home.reduce((x, b) => x + timeToMinutes(b.end) - timeToMinutes(b.start), 0), 0);
  // Tempo fora (trabalho/deslocamento), considerando o dia acordado de 06:00 às 23:00.
  const awayMin = sched.reduce((acc, d) => {
    const home = d.home.reduce((x, b) => x + timeToMinutes(b.end) - timeToMinutes(b.start), 0);
    return acc + Math.max(0, 17 * 60 - home);
  }, 0);
  const days = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'];
  const extras = days.reduce((acc, d) => acc + dayCapacity(member, d, household), 0);
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 }}>
      <Avatar member={member} />
      <View style={{ flex: 1 }}>
        <T bold>{member.name}</T>
        <T muted size="small">Em casa acordado(a): ~{formatMinutes(homeMin)}/semana · fora: ~{formatMinutes(awayMin)}</T>
        <T muted size="small">
          Manhãs com as crianças: {sched.filter((d) => d.morning_kids).length} · jantares: {sched.filter((d) => d.dinner).length} · noites: {sched.filter((d) => d.evening).length}
        </T>
        <T muted size="small">Espaço para tarefas extras (já com descanso): ~{formatMinutes(extras)}/semana</T>
      </View>
    </View>
  );
}
