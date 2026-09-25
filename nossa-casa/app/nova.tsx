// Nova tarefa rápida (uma vez). Para repetir, use "Nova tarefa recorrente" na aba Tarefas.
import { router } from 'expo-router';
import { useState } from 'react';
import { app } from '@/src/data/app';
import { CATEGORIES, MINUTE_OPTIONS, PRIORITY_INFO } from '@/src/domain/categories';
import { addDays, formatShort } from '@/src/domain/dates';
import type { CategoryId, Priority } from '@/src/domain/types';
import { Button, Card, Chip, Field, Row, Screen, T } from '@/src/ui/components';
import { useAdults, useKids, useToday } from '@/src/ui/selectors';

export default function NewTask() {
  const today = useToday();
  const adults = useAdults();
  const kids = useKids();
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState<CategoryId>('geral');
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState(15);
  const [priority, setPriority] = useState<Priority>('medium');
  const [who, setWho] = useState<string[]>([]);
  const [time, setTime] = useState('');
  const isKid = who.length === 1 && kids.some((k) => k.id === who[0]);

  const save = () => {
    if (!title.trim()) return;
    app.actions.addOneOff({
      title: title.trim(), category: isKid ? 'criancas' : cat, date, minutes, effort: minutes >= 45 ? 2 : 1, priority,
      assignee_ids: who.length ? who : [app.store.state.meId ?? adults[0].id],
      due_time: /^\d{2}:\d{2}$/.test(time) ? time : null, kind: isKid ? 'mission' : 'chore', points: isKid ? 2 : 0,
    });
    router.back();
  };

  return (
    <Screen>
      <Card>
        <Field label="O que precisa ser feito?" value={title} onChangeText={setTitle} placeholder="Ex.: Comprar frutas" autoFocus />
        <T muted size="small">Para quem</T>
        <Row wrap>
          {adults.map((a) => <Chip key={a.id} label={`${a.emoji} ${a.name}`} color={a.color} selected={who.length === 1 && who[0] === a.id} onPress={() => setWho([a.id])} />)}
          <Chip label="👥 Os dois" selected={who.length === 2} onPress={() => setWho(adults.map((a) => a.id))} />
          {kids.map((k) => <Chip key={k.id} label={`${k.emoji} ${k.name} (missão)`} color={k.color} selected={who[0] === k.id} onPress={() => setWho([k.id])} />)}
        </Row>
        <T muted size="small">Quando</T>
        <Row wrap>
          {Array.from({ length: 8 }, (_, i) => addDays(today, i)).map((d) => <Chip key={d} label={d === today ? 'Hoje' : formatShort(d)} selected={d === date} onPress={() => setDate(d)} />)}
        </Row>
        <Field label="Horário (opcional)" value={time} onChangeText={setTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation" />
        <T muted size="small">Tempo</T>
        <Row wrap>{MINUTE_OPTIONS.map((m) => <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />)}</Row>
        <T muted size="small">Prioridade</T>
        <Row wrap>{(['high', 'medium', 'low'] as Priority[]).map((p) => <Chip key={p} label={PRIORITY_INFO[p].emoji} selected={priority === p} onPress={() => setPriority(p)} />)}</Row>
        {!isKid ? (
          <>
            <T muted size="small">Categoria</T>
            <Row wrap>{CATEGORIES.filter((c) => c.id !== 'cobertura').map((c) => <Chip key={c.id} label={`${c.emoji} ${c.label}`} selected={cat === c.id} onPress={() => setCat(c.id)} />)}</Row>
          </>
        ) : null}
      </Card>
      <Button label="Salvar" icon="💾" onPress={save} disabled={!title.trim()} />
    </Screen>
  );
}
