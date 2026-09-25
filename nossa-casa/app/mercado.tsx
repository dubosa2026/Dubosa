// Lista de compras compartilhada + tarefa semanal "Fazer mercado".
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { formatShort } from '@/src/domain/dates';
import { Button, Card, Checkbox, Empty, Field, H2, Row, Screen, T } from '@/src/ui/components';
import { useToday, visible } from '@/src/ui/selectors';

export default function Market() {
  const today = useToday();
  const items = useNC((s) => s.shopping.filter((x) => !x.deleted));
  const members = useNC((s) => s.members);
  const next = useNC((s) => s.instances.filter((i) => visible(i) && i.kind === 'market' && i.status === 'pending' && i.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const who = (id: string | null) => members.find((m) => m.id === id)?.name;
  const pending = items.filter((i) => !i.bought).sort((a, b) => a.name.localeCompare(b.name));
  const bought = items.filter((i) => i.bought);

  const add = () => {
    app.actions.addShopping(name, qty, note);
    setName('');
    setQty('');
    setNote('');
  };

  return (
    <Screen>
      <Card>
        <H2>🛒 Próximo mercado</H2>
        {next ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T bold>{formatShort(next.date)}{next.due_time ? ` · ${next.due_time}` : ''}</T>
              <T muted>Responsável: {next.assignee_ids.map(who).join(' + ')}</T>
            </View>
            <Button small kind="secondary" label="Trocar" onPress={() => router.push({ pathname: '/tarefa/[id]', params: { id: next.id } })} />
          </Row>
        ) : <T muted>Nenhum mercado programado.</T>}
      </Card>
      <Card>
        <H2>Adicionar</H2>
        <Field label="Produto" value={name} onChangeText={setName} placeholder="Ex.: Leite" onSubmitEditing={add} returnKeyType="done" />
        <Row>
          <View style={{ flex: 1 }}><Field label="Quantidade" value={qty} onChangeText={setQty} placeholder="2 caixas" /></View>
          <View style={{ flex: 1 }}><Field label="Observação" value={note} onChangeText={setNote} placeholder="integral" /></View>
        </Row>
        <Button label="Adicionar à lista" icon="➕" onPress={add} disabled={!name.trim()} />
      </Card>
      <Card>
        <H2>Precisamos comprar ({pending.length})</H2>
        {pending.map((i) => (
          <Row key={i.id} style={{ paddingVertical: 8 }}>
            <Checkbox checked={false} onPress={() => app.actions.toggleShopping(i.id)} label={i.name} />
            <View style={{ flex: 1 }}>
              <T bold>{i.name}{i.quantity ? ` — ${i.quantity}` : ''}</T>
              <T muted size="small">{i.note ? `${i.note} · ` : ''}por {who(i.added_by) ?? '—'}</T>
            </View>
            <Button small kind="ghost" label="🗑" onPress={() => app.actions.removeShopping(i.id)} />
          </Row>
        ))}
        {!pending.length ? <Empty emoji="🧺" text="Lista vazia." /> : null}
      </Card>
      {bought.length ? (
        <Card>
          <H2 right={<Button small kind="ghost" label="Limpar" onPress={() => app.actions.clearBought()} />}>Comprados ({bought.length})</H2>
          {bought.map((i) => (
            <Row key={i.id} style={{ paddingVertical: 6 }}>
              <Checkbox checked onPress={() => app.actions.toggleShopping(i.id)} label={i.name} />
              <T muted>{i.name} · {who(i.bought_by)}</T>
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
