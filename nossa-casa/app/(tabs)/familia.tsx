// FAMÍLIA ❤️ — tempo em família (não é tarefa doméstica), compromissos e crianças.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { addDays, formatShort, weekday } from '@/src/domain/dates';
import type { EventType } from '@/src/domain/types';
import { Banner, Button, Card, Chip, Empty, Field, H2, Row, Screen, Segmented, T } from '@/src/ui/components';
import { useKids, useToday } from '@/src/ui/selectors';
import { useColors } from '@/src/ui/theme';

export const PLACES = [
  { id: 'parque', label: '🌳 Parque', ideas: ['Piquenique no parque', 'Andar de bicicleta no parque', 'Parquinho e sorvete'] },
  { id: 'praca', label: '🛝 Praça', ideas: ['Brincar na praça do bairro', 'Feirinha na praça'] },
  { id: 'restaurante', label: '🍝 Restaurante', ideas: ['Almoço em família', 'Pizza no fim da tarde'] },
  { id: 'cinema', label: '🎬 Cinema', ideas: ['Filme infantil no cinema', 'Sessão de cinema em casa com pipoca'] },
  { id: 'ar_livre', label: '☀️ Ao ar livre', ideas: ['Caminhada', 'Passeio de bicicleta', 'Ver o pôr do sol'] },
  { id: 'visita', label: '👵 Visita familiar', ideas: ['Visitar os avós', 'Almoço na casa dos tios'] },
  { id: 'criancas', label: '🎨 Atividade com crianças', ideas: ['Oficina de pintura', 'Museu ou biblioteca infantil', 'Teatro infantil'] },
  { id: 'livre', label: '💫 Passeio livre', ideas: ['Explorar um bairro novo', 'Feira de artesanato'] },
];

export default function Family() {
  const c = useColors();
  const today = useToday();
  const events = useNC((s) => s.events);
  const goal = useNC((s) => s.household?.settings.outing_goal_per_weekend ?? 1);
  const kids = useKids();
  const [type, setType] = useState<EventType>('outing');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState<string | null>(null);
  const toSat = (6 - weekday(today) + 7) % 7;
  const sat = addDays(today, weekday(today) === 0 ? -1 : toSat);
  const sun = addDays(sat, 1);
  const [date, setDate] = useState(weekday(today) === 0 ? today : sat);
  const [time, setTime] = useState('');

  const live = events.filter((e) => !e.deleted);
  const weekendOutings = live.filter((e) => e.type === 'outing' && (e.date === sat || e.date === sun));
  const upcoming = live.filter((e) => e.date >= today).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
  const past = live.filter((e) => e.date < today && e.type === 'outing').sort((a, b) => b.date.localeCompare(a.date));
  const [suggestion, setSuggestion] = useState<{ title: string; place: string } | null>(null);
  const suggest = () => {
    const recent = new Set(past.slice(0, 3).map((e) => e.place_type));
    const pool = PLACES.filter((p) => !recent.has(p.id));
    const p = pool[Math.floor(Math.random() * pool.length)] ?? PLACES[0];
    setSuggestion({ title: p.ideas[Math.floor(Math.random() * p.ideas.length)], place: p.id });
  };
  const dates = useMemo(() => [today, addDays(today, 1), sat, sun, addDays(sat, 7), addDays(sun, 7)].filter((d, i, a) => a.indexOf(d) === i && d >= today), [today, sat, sun]);

  const save = () => {
    const t = title.trim() || (place ? PLACES.find((p) => p.id === place)!.label.slice(3) : '');
    if (!t) return;
    app.actions.addEvent({ type, title: t, place_type: type === 'outing' ? place : null, date, time: /^\d{2}:\d{2}$/.test(time) ? time : null, participant_ids: [], notes: null });
    setTitle('');
    setPlace(null);
    setTime('');
    setSuggestion(null);
  };

  return (
    <Screen title="Família ❤️" subtitle="Tempo em família — não é tarefa, é o que importa.">
      <Card tint={c.soft}>
        <H2>Este fim de semana</H2>
        <T>{formatShort(sat)} e {formatShort(sun)}</T>
        {weekendOutings.length >= goal ? (
          <Banner kind="success" text={`Passeio combinado: ${weekendOutings.map((e) => e.title).join(', ')} 💚`} />
        ) : (
          <Banner kind="info" text="Objetivo: pelo menos um passeio em família por fim de semana." />
        )}
        <Button label="Sugerir um passeio" icon="✨" kind="secondary" onPress={suggest} />
        {suggestion ? (
          <View style={{ marginTop: 10 }}>
            <T bold>Que tal: {suggestion.title}?</T>
            <Button small label="Marcar este" onPress={() => { setType('outing'); setTitle(suggestion.title); setPlace(suggestion.place); }} style={{ marginTop: 6 }} />
          </View>
        ) : null}
      </Card>

      <Card>
        <H2>Registrar</H2>
        <Segmented value={type} onChange={setType} options={[{ value: 'outing', label: '❤️ Passeio' }, { value: 'appointment', label: '📅 Compromisso' }]} />
        {type === 'outing' ? (
          <Row wrap>{PLACES.map((p) => <Chip key={p.id} label={p.label} selected={place === p.id} onPress={() => setPlace(place === p.id ? null : p.id)} />)}</Row>
        ) : null}
        <Field label={type === 'outing' ? 'Descrição (opcional)' : 'Compromisso'} value={title} onChangeText={setTitle} placeholder={type === 'outing' ? 'Ex.: Piquenique no parque' : 'Ex.: Pediatra da Inaê'} />
        <T muted size="small">Quando</T>
        <Row wrap>{dates.map((d) => <Chip key={d} label={d === today ? 'Hoje' : formatShort(d)} selected={date === d} onPress={() => setDate(d)} />)}</Row>
        <Field label="Horário (opcional)" placeholder="15:00" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
        <Button label="Salvar" onPress={save} disabled={!title.trim() && !place} />
      </Card>

      <Card>
        <H2>Próximos</H2>
        {upcoming.map((e) => (
          <Row key={e.id} style={{ paddingVertical: 8, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T bold>{e.type === 'outing' ? '❤️' : '📅'} {e.title}</T>
              <T muted size="small">{formatShort(e.date)}{e.time ? ` · ${e.time}` : ''}{e.done ? ' · feito ✓' : ''}</T>
            </View>
            <Button small kind="secondary" label={e.done ? 'Desfazer' : 'Feito'} onPress={() => app.actions.toggleEvent(e.id)} />
            <Button small kind="ghost" label="🗑" onPress={() => app.actions.removeEvent(e.id)} />
          </Row>
        ))}
        {!upcoming.length ? <Empty emoji="🧺" text="Nada marcado ainda." /> : null}
      </Card>

      {past.length ? (
        <Card>
          <H2>Nossos últimos passeios</H2>
          {past.slice(0, 6).map((e) => <T key={e.id}>❤️ {e.title} — {formatShort(e.date)}</T>)}
        </Card>
      ) : null}

      <Row>
        <Button label="Crianças" icon="🧸" kind="secondary" onPress={() => router.push('/criancas')} style={{ flex: 1 }} />
        <Button label="Lição" icon="📚" kind="secondary" onPress={() => router.push('/licao')} style={{ flex: 1 }} />
      </Row>
      {kids.length ? null : <T muted>Cadastre as crianças em Configurações.</T>}
    </Screen>
  );
}
