// "REORGANIZAR MINHA SEMANA": calcula, mostra e só aplica com confirmação.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { weekBalance } from '@/src/domain/balance';
import { formatMinutes, formatShort, weekStart } from '@/src/domain/dates';
import type { PlanResult } from '@/src/domain/planner';
import { Banner, Button, Card, Empty, H2, Row, Screen, T } from '@/src/ui/components';
import { useToday } from '@/src/ui/selectors';

export default function Reorganize() {
  const today = useToday();
  const members = useNC((s) => s.members);
  const instances = useNC((s) => s.instances);
  const household = useNC((s) => s.household)!;
  const [result] = useState<PlanResult | null>(() => app.actions.previewReorganize(today));
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? '?';

  const changes = (result?.changes ?? []).filter((c) => c.before && c.instance.kind !== 'coverage');
  const newCoverage = (result?.changes ?? []).filter((c) => c.instance.kind === 'coverage' && c.instance.status !== 'cancelled').length;
  const after = useMemo(() => {
    if (!result) return null;
    const map = new Map(instances.map((i) => [i.id, i]));
    for (const c of result.changes) map.set(c.instance.id, c.instance);
    return weekBalance([...map.values()], members, household, weekStart(today));
  }, [result, instances, members, household, today]);
  const before = useMemo(() => weekBalance(instances, members, household, weekStart(today)), [instances, members, household, today]);

  if (!result || (!changes.length && !result.deferred.length)) {
    return (
      <Screen>
        <Empty emoji="✅" text="A semana já está bem distribuída. Nada para mudar agora." />
        <Button label="Voltar" kind="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <T size="title" bold>Encontramos uma nova distribuição. Deseja aplicar?</T>
        <T muted>Analisamos pendências, atrasadas, horários, carga de cada um, preferências, crianças e prioridades.</T>
      </Card>
      {after ? (
        <Card>
          <H2>Equilíbrio</H2>
          {after.members.map((m) => {
            const b = before.members.find((x) => x.member.id === m.member.id);
            return <T key={m.member.id}>{m.member.name}: {formatMinutes(b?.minutes ?? 0)} → {formatMinutes(m.minutes)}</T>;
          })}
          <Banner kind={after.balanced ? 'success' : 'warn'} text={after.title} />
        </Card>
      ) : null}
      <Card>
        <H2>Mudanças ({changes.length})</H2>
        {changes.slice(0, 60).map((c) => (
          <View key={c.instance.id} style={{ paddingVertical: 6 }}>
            <T bold>{c.instance.title}</T>
            <T muted size="small">
              {c.before!.assignee_ids.map(name).join(' + ')} · {formatShort(c.before!.date)} → {c.instance.assignee_ids.map(name).join(' + ')} · {formatShort(c.instance.date)}
            </T>
          </View>
        ))}
        {changes.length > 60 ? <T muted>+ {changes.length - 60}</T> : null}
        {newCoverage ? <T muted size="small">🤝 {newCoverage} janela(s) de cobertura das crianças ajustada(s).</T> : null}
      </Card>
      {result.deferred.length ? (
        <Card>
          <H2>Fica para depois ({result.deferred.length})</H2>
          <T muted size="small">Para não sobrecarregar ninguém, o que é menos urgente fica para outra semana:</T>
          {result.deferred.map((d, i) => <T key={i} size="small">• {d.title} — {d.reason}</T>)}
        </Card>
      ) : null}
      {result.warnings.map((w) => <Banner key={w} kind="warn" text={w} />)}
      <Row>
        <Button label="CANCELAR" kind="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button label="APLICAR" onPress={() => { app.actions.applyReorganize(result); router.back(); }} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
