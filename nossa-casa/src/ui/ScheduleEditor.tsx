// Editor da agenda semanal de um adulto: em casa pela manhã / no jantar / à noite
// e minutos disponíveis para tarefas extras em cada dia.
import { Pressable, Text, TextInput, View } from 'react-native';
import { WEEKDAY_SHORT } from '../domain/dates';
import type { DaySchedule, Member } from '../domain/types';
import { app } from '../data/app';
import { Chip, Row, T } from './components';
import { font, space, useColors } from './theme';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function ScheduleEditor({ member }: { member: Member }) {
  const c = useColors();
  const sched = member.schedule ?? [];
  const update = (wd: number, patch: Partial<DaySchedule>) => {
    const next = sched.map((d, i) => (i === wd ? { ...d, ...patch } : d));
    app.actions.updateMember(member.id, { schedule: next });
  };
  return (
    <View>
      {ORDER.map((wd) => {
        const d = sched[wd];
        if (!d) return null;
        return (
          <View key={wd} style={{ paddingVertical: space.s, borderBottomWidth: 1, borderColor: c.border }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T bold>{WEEKDAY_SHORT[wd]}</T>
              <T muted size="small">{d.home.map((b) => `${b.start}–${b.end}`).join(' · ') || 'fora o dia todo'}</T>
            </Row>
            <Row wrap style={{ marginTop: 6 }}>
              <Chip label="☀️ manhã c/ crianças" selected={d.morning_kids} onPress={() => update(wd, { morning_kids: !d.morning_kids })} color={member.color} />
              <Chip label="🍳 jantar" selected={d.dinner} onPress={() => update(wd, { dinner: !d.dinner })} color={member.color} />
              <Chip label="🌙 noite" selected={d.evening} onPress={() => update(wd, { evening: !d.evening })} color={member.color} />
            </Row>
            <Row>
              <T muted size="small">Tempo para tarefas extras:</T>
              <Stepper value={d.capacity} onChange={(v) => update(wd, { capacity: v })} />
            </Row>
          </View>
        );
      })}
    </View>
  );
}

export function Stepper({ value, onChange, step = 10, min = 0, max = 300, suffix = 'min' }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string;
}) {
  const c = useColors();
  const btn = (label: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta > 0 ? 'aumentar' : 'diminuir'}
      onPress={() => onChange(Math.max(min, Math.min(max, value + delta)))}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
  return (
    <Row>
      {btn('−', -step)}
      <Text style={{ color: c.text, fontSize: font.body, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{value} {suffix}</Text>
      {btn('+', step)}
    </Row>
  );
}

export function TimeBlocksEditor({ member, wd }: { member: Member; wd: number }) {
  const c = useColors();
  const d = member.schedule?.[wd];
  if (!d) return null;
  const setBlock = (idx: number, field: 'start' | 'end', v: string) => {
    const home = d.home.map((b, i) => (i === idx ? { ...b, [field]: v } : b));
    app.actions.updateMember(member.id, { schedule: (member.schedule ?? []).map((x, i) => (i === wd ? { ...x, home } : x)) });
  };
  return (
    <View>
      {d.home.map((b, i) => (
        <Row key={i} style={{ marginBottom: 6 }}>
          <T size="small" style={{ width: 120 }}>{b.label}</T>
          {(['start', 'end'] as const).map((f) => (
            <TextInput
              key={f}
              defaultValue={b[f]}
              onEndEditing={(e) => /^\d{2}:\d{2}$/.test(e.nativeEvent.text) && setBlock(i, f, e.nativeEvent.text)}
              style={{ borderWidth: 1, borderColor: c.border, color: c.text, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, width: 70, textAlign: 'center' }}
            />
          ))}
        </Row>
      ))}
    </View>
  );
}
