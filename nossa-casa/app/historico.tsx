// Histórico: concluídas, atrasadas, transferidas, canceladas — com filtros.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNC } from '@/src/data/app';
import { category, CATEGORIES } from '@/src/domain/categories';
import { addDays, formatShort } from '@/src/domain/dates';
import type { CategoryId } from '@/src/domain/types';
import { Card, Chip, Empty, H2, Row, Screen, Segmented, T } from '@/src/ui/components';
import { ACTION } from '@/src/ui/labels';
import { useAdults, useToday } from '@/src/ui/selectors';

type Kind = 'done' | 'late' | 'transferred' | 'cancelled';

export default function History() {
  const today = useToday();
  const adults = useAdults();
  const instances = useNC((s) => s.instances);
  const logs = useNC((s) => s.logs);
  const members = useNC((s) => s.members);
  const [kind, setKind] = useState<Kind>('done');
  const [who, setWho] = useState<string>('all');
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [days, setDays] = useState(7);
  const since = addDays(today, -days);
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? '—';
  const whoOk = (ids: string[]) => who === 'all' || (who === 'kids' ? ids.some((id) => members.find((m) => m.id === id)?.kind === 'child') : ids.includes(who));

  const rows = useMemo(() => {
    if (kind === 'transferred') {
      return logs
        .filter((l) => (l.action === 'transferred' || l.action === 'postponed') && l.created_at.slice(0, 10) >= since)
        .filter((l) => !cat || l.category === cat)
        .filter((l) => who === 'all' || l.actor_id === who)
        .map((l) => ({
          key: l.id,
          title: `${category((l.category ?? 'geral') as CategoryId).emoji} ${l.title}`,
          sub: `${name(l.actor_id)} ${ACTION[l.action]}${l.details.from ? ` de ${String(l.details.from)}` : ''}${l.details.to ? ` para ${String(l.details.to)}` : ''} · ${new Date(l.created_at).toLocaleString()}${l.details.rule ? ` · ${String(l.details.rule)}` : ''}`,
        }));
    }
    return instances
      .filter((i) => !i.deleted && i.date >= since && i.date <= today)
      .filter((i) => (kind === 'done' ? i.status === 'done' : kind === 'late' ? i.status === 'pending' && i.date < today : i.status === 'cancelled'))
      .filter((i) => i.kind !== 'coverage' || kind !== 'late')
      .filter((i) => !cat || i.category === cat)
      .filter((i) => whoOk(kind === 'done' && i.completed_by.length ? i.completed_by.concat(i.assignee_ids) : i.assignee_ids))
      .sort((a, b) => (b.completed_at ?? b.date).localeCompare(a.completed_at ?? a.date))
      .map((i) => ({
        key: i.id,
        title: `${category(i.category).emoji} ${i.title}`,
        sub: kind === 'done'
          ? `${i.completed_by.map(name).join(' + ') || i.assignee_ids.map(name).join(' + ')} · ${i.completed_at ? new Date(i.completed_at).toLocaleString() : formatShort(i.date)}${i.actual_seconds ? ` · ⏱ ${Math.round(i.actual_seconds / 60)} min` : ''}`
          : `${i.assignee_ids.map(name).join(' + ')} · ${formatShort(i.date)}`,
      }));
  }, [kind, logs, instances, since, today, cat, who, members]);

  return (
    <Screen>
      <Segmented value={kind} onChange={setKind} options={[
        { value: 'done', label: 'Concluídas' }, { value: 'late', label: 'Atrasadas' }, { value: 'transferred', label: 'Transferidas' }, { value: 'cancelled', label: 'Canceladas' },
      ]} />
      <Row wrap>
        <Chip label="Todos" selected={who === 'all'} onPress={() => setWho('all')} />
        {adults.map((a) => <Chip key={a.id} label={a.name} color={a.color} selected={who === a.id} onPress={() => setWho(a.id)} />)}
        <Chip label="Crianças" selected={who === 'kids'} onPress={() => setWho('kids')} />
      </Row>
      <Row wrap>
        {[7, 30, 90].map((d) => <Chip key={d} label={`${d} dias`} selected={days === d} onPress={() => setDays(d)} />)}
      </Row>
      <Row wrap>
        <Chip label="Todas categorias" selected={!cat} onPress={() => setCat(null)} />
        {CATEGORIES.map((x) => <Chip key={x.id} label={x.emoji} selected={cat === x.id} onPress={() => setCat(cat === x.id ? null : x.id)} />)}
      </Row>
      <Card>
        <H2>{rows.length} registro(s)</H2>
        {rows.slice(0, 200).map((r) => (
          <View key={r.key} style={{ paddingVertical: 8 }}>
            <T bold>{r.title}</T>
            <T muted size="small">{r.sub}</T>
          </View>
        ))}
        {!rows.length ? <Empty emoji="📜" text="Nada neste filtro." /> : null}
      </Card>
    </Screen>
  );
}
