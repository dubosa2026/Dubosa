// Lição de casa (programada para sábado): atividade, matéria, prazo, observação, concluído.
import { useState } from 'react';
import { View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { addDays, formatShort, weekday } from '@/src/domain/dates';
import { Button, Card, Checkbox, Chip, Empty, Field, H2, Row, Screen, T } from '@/src/ui/components';
import { useKids, useToday, visible } from '@/src/ui/selectors';

export default function Homework() {
  const today = useToday();
  const kids = useKids();
  const list = useNC((s) => s.homework.filter((h) => !h.deleted));
  const members = useNC((s) => s.members);
  const session = useNC((s) => s.instances.filter((i) => visible(i) && i.kind === 'homework' && i.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]);
  const [child, setChild] = useState(kids[0]?.id ?? '');
  const [activity, setActivity] = useState('');
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const nextSat = addDays(today, (6 - weekday(today) + 7) % 7);
  const [due, setDue] = useState<string | null>(nextSat);

  const add = () => {
    app.actions.addHomework(child, activity, subject, due, note);
    setActivity('');
    setSubject('');
    setNote('');
  };
  const pending = list.filter((h) => !h.done).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));
  const done = list.filter((h) => h.done);

  return (
    <Screen>
      <Card>
        <H2>📚 Próxima sessão de lição</H2>
        {session ? (
          <T>{formatShort(session.date)}{session.due_time ? ` · ${session.due_time}` : ''} — acompanha: {session.assignee_ids.map((id) => members.find((m) => m.id === id)?.name).join(' + ')}</T>
        ) : <T muted>Nenhuma programada.</T>}
      </Card>
      <Card>
        <H2>Registrar atividade</H2>
        <Row wrap>{kids.map((k) => <Chip key={k.id} label={`${k.emoji} ${k.name}`} color={k.color} selected={child === k.id} onPress={() => setChild(k.id)} />)}</Row>
        <Field label="Atividade" value={activity} onChangeText={setActivity} placeholder="Ex.: Página 12 do caderno" />
        <Field label="Matéria" value={subject} onChangeText={setSubject} placeholder="Ex.: Matemática" />
        <T muted size="small">Prazo</T>
        <Row wrap>
          {[today, addDays(today, 1), nextSat, addDays(nextSat, 2), addDays(nextSat, 7)].filter((d, i, a) => a.indexOf(d) === i).map((d) => (
            <Chip key={d} label={d === today ? 'Hoje' : formatShort(d)} selected={due === d} onPress={() => setDue(d)} />
          ))}
          <Chip label="Sem prazo" selected={due === null} onPress={() => setDue(null)} />
        </Row>
        <Field label="Observação" value={note} onChangeText={setNote} multiline />
        <Button label="Adicionar" icon="➕" onPress={add} disabled={!activity.trim() || !child} />
      </Card>
      <Card>
        <H2>Pendentes ({pending.length})</H2>
        {pending.map((h) => (
          <Row key={h.id} style={{ paddingVertical: 8 }}>
            <Checkbox checked={false} onPress={() => app.actions.toggleHomework(h.id)} label={h.activity} />
            <View style={{ flex: 1 }}>
              <T bold>{h.activity}</T>
              <T muted size="small">
                {members.find((m) => m.id === h.child_id)?.name}{h.subject ? ` · ${h.subject}` : ''}{h.due_date ? ` · até ${formatShort(h.due_date)}` : ''}
                {h.due_date && h.due_date < today ? ' · ⚠️ atrasada' : ''}
              </T>
              {h.note ? <T muted size="small">{h.note}</T> : null}
            </View>
            <Button small kind="ghost" label="🗑" onPress={() => app.actions.removeHomework(h.id)} />
          </Row>
        ))}
        {!pending.length ? <Empty emoji="✏️" text="Nenhuma lição pendente." /> : null}
      </Card>
      {done.length ? (
        <Card>
          <H2>Concluídas</H2>
          {done.slice(0, 15).map((h) => (
            <Row key={h.id} style={{ paddingVertical: 4 }}>
              <Checkbox checked onPress={() => app.actions.toggleHomework(h.id)} label={h.activity} />
              <T muted>{h.activity}{h.subject ? ` · ${h.subject}` : ''}</T>
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
