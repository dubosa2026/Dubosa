import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { app, useNC } from '@/src/data/app';
import { WEEKDAY_SHORT } from '@/src/domain/dates';
import { Button, Card, Chip, Empty, Field, H2, Row, Screen, T } from '@/src/ui/components';
import { ScheduleEditor, TimeBlocksEditor } from '@/src/ui/ScheduleEditor';
import { PrefPicker } from '@/src/screens/SetupWizard';

const EMOJIS = ['👨', '👩', '🧑', '👧', '👦', '🧒', '👶', '🙂', '😊', '🦁', '🐻', '🦊'];
const COLORS = ['#3B7DD8', '#D8537B', '#F2A93B', '#4FB286', '#8E6CD8', '#E0694F', '#2BA5A5', '#7A7068'];

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useNC((s) => s.members.find((x) => x.id === id));
  const [name, setName] = useState(m?.name ?? '');
  const [day, setDay] = useState(1);
  if (!m) return <Screen><Empty emoji="🔎" text="Pessoa não encontrada." /></Screen>;
  const upd = (patch: Parameters<typeof app.actions.updateMember>[1]) => app.actions.updateMember(m.id, patch);

  return (
    <Screen>
      <Card>
        <Field label="Nome" value={name} onChangeText={setName} onEndEditing={() => name.trim() && name !== m.name && upd({ name: name.trim() })} />
        {m.kind === 'child' ? (
          <Field label="Idade" keyboardType="number-pad" defaultValue={m.age ? String(m.age) : ''} onEndEditing={(e) => upd({ age: Number(e.nativeEvent.text) || null })} />
        ) : <T muted>Administrador(a) — mesmo acesso que o outro adulto.</T>}
        <T muted size="small">Emoji</T>
        <Row wrap>{EMOJIS.map((e) => <Chip key={e} label={e} selected={m.emoji === e} onPress={() => upd({ emoji: e })} />)}</Row>
        <T muted size="small">Cor</T>
        <Row wrap>{COLORS.map((c) => <Chip key={c} label="   " color={c} selected={m.color === c} onPress={() => upd({ color: c })} />)}</Row>
      </Card>
      {m.kind === 'adult' ? (
        <>
          <Card>
            <H2>Horários em casa</H2>
            <Row wrap>{[1, 2, 3, 4, 5, 6, 0].map((d) => <Chip key={d} label={WEEKDAY_SHORT[d]} selected={day === d} onPress={() => setDay(d)} />)}</Row>
            <TimeBlocksEditor member={m} wd={day} />
          </Card>
          <Card>
            <H2>Semana</H2>
            <ScheduleEditor member={m} />
          </Card>
          <Card><PrefPicker member={m} /></Card>
        </>
      ) : (
        <Button kind="danger" label="Remover criança" onPress={() => { upd({ deleted: true }); router.back(); }} />
      )}
    </Screen>
  );
}
