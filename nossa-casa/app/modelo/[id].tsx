// Criar/editar uma tarefa cadastrada (recorrente) ou uma missão das crianças.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { CATEGORIES, EFFORT_INFO, MINUTE_OPTIONS, PRIORITY_INFO } from '@/src/domain/categories';
import { today as todayISO, WEEKDAY_SHORT } from '@/src/domain/dates';
import { randomId } from '@/src/domain/ids';
import { describeRecurrence, RECURRENCE_LABEL } from '@/src/domain/recurrence';
import { suggestRecurrence } from '@/src/domain/seed';
import type { Effort, Priority, RecurrenceType, Slot, TaskTemplate, Weekday } from '@/src/domain/types';
import { Banner, Button, Card, Chip, Field, H2, Row, Screen, T } from '@/src/ui/components';
import { Stepper } from '@/src/ui/ScheduleEditor';
import { useAdults, useKids } from '@/src/ui/selectors';

const SLOTS: { value: Slot; label: string }[] = [
  { value: 'any', label: 'Qualquer hora' },
  { value: 'morning', label: '☀️ Manhã' },
  { value: 'afternoon', label: '🌤 Tarde' },
  { value: 'evening', label: '🌙 Noite' },
];

export default function TemplateEditor() {
  const { id, missao } = useLocalSearchParams<{ id: string; missao?: string }>();
  const existing = useNC((s) => s.templates.find((t) => t.id === id));
  const household = useNC((s) => s.household)!;
  const adults = useAdults();
  const kids = useKids();
  const isNew = !existing;
  const [t, setT] = useState<TaskTemplate>(
    () =>
      existing ?? {
        id: randomId(),
        household_id: household.id,
        title: '',
        category: missao === '1' ? 'criancas' : 'limpeza',
        room: null,
        kind: missao === '1' ? 'mission' : 'chore',
        effort: 1,
        minutes: missao === '1' ? 10 : 15,
        priority: 'medium',
        recurrence: { type: missao === '1' ? 'daily' : 'weekly', start: todayISO() },
        assign_mode: missao === '1' ? 'fixed' : 'auto',
        assignee_ids: missao === '1' && kids[0] ? [kids[0].id] : [],
        rule_tag: null,
        slot: 'any',
        due_time: null,
        points: missao === '1' ? 2 : 0,
        notes: null,
        active: true,
        created_by: null,
        updated_by: null,
        created_at: '',
        updated_at: '',
        deleted: false,
      },
  );
  const [timeText, setTimeText] = useState(existing?.due_time ?? '');
  const [touchedFreq, setTouchedFreq] = useState(!isNew);
  const set = (patch: Partial<TaskTemplate>) => setT((x) => ({ ...x, ...patch }));
  const setRec = (patch: Partial<TaskTemplate['recurrence']>) => {
    setTouchedFreq(true);
    set({ recurrence: { ...t.recurrence, ...patch } });
  };
  const mission = t.kind === 'mission';
  const wds = t.recurrence.weekdays ?? [];

  const save = () => {
    if (!t.title.trim()) return;
    app.actions.saveTemplate({ ...t, title: t.title.trim() });
    router.back();
  };

  return (
    <Screen>
      <Card>
        <Field
          label={mission ? 'Missão' : 'Tarefa'}
          value={t.title}
          onChangeText={(title) => set({ title, ...(isNew && !touchedFreq && !mission ? { recurrence: { ...suggestRecurrence(title), start: t.recurrence.start } } : {}) })}
          placeholder={mission ? 'Ex.: Guardar brinquedos' : 'Ex.: Limpar geladeira'}
        />
        {!mission ? <Field label="Cômodo (opcional)" value={t.room ?? ''} onChangeText={(room) => set({ room: room || null })} placeholder="Ex.: Cozinha" /> : null}
        <T muted size="small">Categoria</T>
        <Row wrap>
          {CATEGORIES.filter((c) => c.id !== 'cobertura').map((c) => <Chip key={c.id} label={`${c.emoji} ${c.label}`} selected={t.category === c.id} onPress={() => set({ category: c.id })} />)}
        </Row>
      </Card>

      <Card>
        <H2>Frequência</H2>
        {isNew && !mission ? <T muted size="small">Sugestão automática pelo nome — pode trocar.</T> : null}
        <Row wrap>
          {(Object.keys(RECURRENCE_LABEL) as RecurrenceType[]).map((r) => (
            <Chip key={r} label={RECURRENCE_LABEL[r]} selected={t.recurrence.type === r} onPress={() => setRec({ type: r, interval: r === 'every_x_days' ? t.recurrence.interval ?? 3 : undefined })} />
          ))}
        </Row>
        {t.recurrence.type === 'every_x_days' ? (
          <Row style={{ justifyContent: 'space-between' }}><T>A cada</T><Stepper value={t.recurrence.interval ?? 3} step={1} min={1} max={180} suffix="dias" onChange={(v) => setRec({ interval: v })} /></Row>
        ) : null}
        {t.recurrence.type !== 'once' && t.recurrence.type !== 'monthly' && t.recurrence.type !== 'every_x_days' ? (
          <>
            <T muted size="small">{t.recurrence.type === 'custom' ? 'Em quais dias?' : 'Dias fixos (opcional — sem marcar, o app escolhe o melhor dia)'}</T>
            <Row wrap>
              {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => (
                <Chip key={d} label={WEEKDAY_SHORT[d]} selected={wds.includes(d)} onPress={() => setRec({ weekdays: wds.includes(d) ? wds.filter((x) => x !== d) : [...wds, d] })} />
              ))}
            </Row>
          </>
        ) : null}
        {t.recurrence.type === 'once' ? (
          <Field label="Data (AAAA-MM-DD, opcional)" value={t.recurrence.date ?? ''} onChangeText={(date) => setRec({ date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined })} placeholder={todayISO()} />
        ) : null}
        <T bold style={{ marginTop: 6 }}>{describeRecurrence(t.recurrence)}</T>
      </Card>

      <Card>
        <H2>Tempo e peso</H2>
        <T muted size="small">Tempo estimado</T>
        <Row wrap>{MINUTE_OPTIONS.map((m) => <Chip key={m} label={`${m} min`} selected={t.minutes === m} onPress={() => set({ minutes: m })} />)}</Row>
        {!mission ? (
          <>
            <T muted size="small">Esforço</T>
            <Row wrap>{([1, 2, 3] as Effort[]).map((e) => <Chip key={e} label={EFFORT_INFO[e].label} selected={t.effort === e} onPress={() => set({ effort: e })} />)}</Row>
            <T muted size="small">Prioridade</T>
            <Row wrap>{(['high', 'medium', 'low'] as Priority[]).map((p) => <Chip key={p} label={`${PRIORITY_INFO[p].emoji} ${PRIORITY_INFO[p].label}`} selected={t.priority === p} onPress={() => set({ priority: p })} />)}</Row>
            <T muted size="small">Turno</T>
            <Row wrap>{SLOTS.map((s) => <Chip key={s.value} label={s.label} selected={t.slot === s.value} onPress={() => set({ slot: s.value })} />)}</Row>
          </>
        ) : (
          <Row style={{ justifyContent: 'space-between' }}><T>⭐ Pontos</T><Stepper value={t.points} step={1} min={0} max={20} suffix="⭐" onChange={(points) => set({ points })} /></Row>
        )}
        <Field label="Horário (opcional, para lembrete)" value={timeText} onChangeText={(v) => { setTimeText(v); set({ due_time: /^\d{2}:\d{2}$/.test(v) ? v : null }); }} placeholder="HH:MM" keyboardType="numbers-and-punctuation" />
      </Card>

      <Card>
        <H2>{mission ? 'Para quem' : 'Quem faz'}</H2>
        {mission ? (
          <Row wrap>{kids.map((k) => <Chip key={k.id} label={`${k.emoji} ${k.name}`} color={k.color} selected={t.assignee_ids.includes(k.id)} onPress={() => set({ assignee_ids: [k.id] })} />)}</Row>
        ) : (
          <>
            <Row wrap>
              <Chip label="⚖️ Divisão automática" selected={t.assign_mode === 'auto'} onPress={() => set({ assign_mode: 'auto', assignee_ids: [] })} />
              {adults.map((a) => (
                <Chip key={a.id} label={`${a.emoji} Sempre ${a.name}`} color={a.color} selected={t.assign_mode === 'fixed' && t.assignee_ids[0] === a.id} onPress={() => set({ assign_mode: 'fixed', assignee_ids: [a.id] })} />
              ))}
              <Chip label="👥 Os dois juntos" selected={t.assign_mode === 'shared'} onPress={() => set({ assign_mode: 'shared', assignee_ids: adults.map((a) => a.id) })} />
            </Row>
            {t.rule_tag ? <Banner kind="info" text="Esta tarefa segue as regras da cozinha/sono: o responsável é definido automaticamente a cada dia." /> : null}
          </>
        )}
        <Field label="Observações" value={t.notes ?? ''} onChangeText={(notes) => set({ notes: notes || null })} multiline />
        <Row style={{ justifyContent: 'space-between' }}>
          <T>Ativa</T>
          <Switch value={t.active} onValueChange={(active) => set({ active })} />
        </Row>
      </Card>

      <Button label="Salvar" icon="💾" onPress={save} disabled={!t.title.trim()} />
      {!isNew ? (
        <View style={{ marginTop: 8 }}>
          <Button kind="danger" label="Excluir tarefa cadastrada" onPress={() => { app.actions.deleteTemplate(t.id); router.back(); }} />
        </View>
      ) : null}
    </Screen>
  );
}
