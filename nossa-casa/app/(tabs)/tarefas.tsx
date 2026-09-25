// TAREFAS — tudo o que está cadastrado (e com qual frequência).
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useNC } from '@/src/data/app';
import { CATEGORIES, category, PRIORITY_INFO } from '@/src/domain/categories';
import { formatMinutes } from '@/src/domain/dates';
import { describeRecurrence } from '@/src/domain/recurrence';
import type { CategoryId, TaskTemplate } from '@/src/domain/types';
import { Button, Card, Chip, Empty, H2, Row, Screen, Segmented, T } from '@/src/ui/components';
import { font, useColors } from '@/src/ui/theme';

export default function Tasks() {
  const c = useColors();
  const templates = useNC((s) => s.templates);
  const members = useNC((s) => s.members);
  const [tab, setTab] = useState<'casa' | 'missoes'>('casa');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoryId | null>(null);

  const list = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return templates
      .filter((t) => !t.deleted && (tab === 'missoes' ? t.kind === 'mission' : t.kind !== 'mission'))
      .filter((t) => !cat || t.category === cat)
      .filter((t) => !q || norm(`${t.title} ${t.room ?? ''}`).includes(norm(q)));
  }, [templates, tab, q, cat]);

  const groups = useMemo(() => {
    const m = new Map<string, TaskTemplate[]>();
    for (const t of list) {
      const key = tab === 'missoes' ? members.find((x) => x.id === t.assignee_ids[0])?.name ?? 'Crianças' : t.room ?? category(t.category).label;
      m.set(key, [...(m.get(key) ?? []), t]);
    }
    return [...m.entries()];
  }, [list, tab, members]);

  const who = (t: TaskTemplate) => {
    if (t.assign_mode === 'shared') return '👥 Eduardo + Jussara';
    if (t.assign_mode === 'fixed') return t.assignee_ids.map((id) => members.find((m) => m.id === id)?.name).join(', ');
    return '⚖️ divisão automática';
  };

  return (
    <Screen title="Tarefas" subtitle={`${list.length} cadastradas`} right={<Button small kind="ghost" label="Histórico" onPress={() => router.push('/historico')} />}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'casa', label: '🏠 Casa' }, { value: 'missoes', label: '🧸 Missões' }]} />
      <TextInput
        placeholder="Buscar tarefa…"
        placeholderTextColor={c.muted}
        value={q}
        onChangeText={setQ}
        style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, fontSize: font.body, color: c.text, backgroundColor: c.card, marginBottom: 8 }}
      />
      {tab === 'casa' ? (
        <Row wrap style={{ marginBottom: 8 }}>
          <Chip label="Todas" selected={!cat} onPress={() => setCat(null)} />
          {CATEGORIES.filter((x) => x.id !== 'cobertura').map((x) => (
            <Chip key={x.id} label={`${x.emoji} ${x.label}`} selected={cat === x.id} onPress={() => setCat(cat === x.id ? null : x.id)} />
          ))}
        </Row>
      ) : null}
      <Button label={tab === 'missoes' ? 'Nova missão' : 'Nova tarefa recorrente'} icon="➕" onPress={() => router.push({ pathname: '/modelo/[id]', params: { id: 'novo', missao: tab === 'missoes' ? '1' : '0' } })} style={{ marginBottom: 12 }} />
      {groups.map(([g, items]) => (
        <Card key={g}>
          <H2>{g}</H2>
          {items.map((t) => (
            <Pressable key={t.id} onPress={() => router.push({ pathname: '/modelo/[id]', params: { id: t.id } })} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: c.border, opacity: t.active ? 1 : 0.5 }}>
              <T bold>{category(t.category).emoji} {t.title}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <T muted size="small">{describeRecurrence(t.recurrence)}</T>
                <T muted size="small">· {formatMinutes(t.minutes)}</T>
                <T muted size="small">· {PRIORITY_INFO[t.priority].emoji}</T>
                {tab === 'casa' ? <T muted size="small">· {who(t)}</T> : <T muted size="small">· ⭐ {t.points}</T>}
                {!t.active ? <T muted size="small">· pausada</T> : null}
              </View>
            </Pressable>
          ))}
        </Card>
      ))}
      {!list.length ? <Empty emoji="🔎" text="Nenhuma tarefa encontrada." /> : null}
    </Screen>
  );
}
