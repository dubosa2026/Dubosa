// Crianças — missões (autonomia, não obrigação pesada), pontos, conquistas e metas.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { weekStart } from '@/src/domain/dates';
import { childProgress } from '@/src/domain/gamification';
import { Avatar, Button, Card, Empty, H2, Progress, Row, Screen, T, TaskRow } from '@/src/ui/components';
import { sortTasks, useKids, useToday, visible } from '@/src/ui/selectors';
import { useColors } from '@/src/ui/theme';

export default function Kids() {
  const c = useColors();
  const today = useToday();
  const kids = useKids();
  const instances = useNC((s) => s.instances);
  const members = useNC((s) => s.members);
  const settings = useNC((s) => s.household!.settings);
  const live = useMemo(() => instances.filter(visible), [instances]);

  return (
    <Screen>
      <T muted>As tarefas das crianças são missões para desenvolver autonomia — sempre leves e com a ajuda de um adulto. 🧸</T>
      {kids.map((k) => {
        const p = childProgress(k, live, today, weekStart(today), settings.weekly_goal_points[k.id] ?? 20);
        const missions = live.filter((i) => i.kind === 'mission' && i.date === today && i.assignee_ids.includes(k.id)).sort(sortTasks);
        return (
          <Card key={k.id} style={{ marginTop: 12 }}>
            <Row>
              <Avatar member={k} size={48} />
              <View style={{ flex: 1 }}>
                <T size="title" bold>{k.name}</T>
                <T muted size="small">Missões de hoje: {missions.filter((i) => i.status === 'done').length}/{missions.length}</T>
              </View>
              {settings.gamification ? <Text style={{ fontSize: 22, fontWeight: '800', color: c.warn }}>⭐ {p.totalPoints}</Text> : null}
            </Row>
            {settings.gamification ? (
              <View style={{ marginVertical: 8 }}>
                <T size="small">🎯 Meta da semana: {p.weekPoints}/{p.weekGoal} ⭐ {p.goalReached ? '— conseguiu! 🎉' : ''}</T>
                <Progress value={p.weekGoal ? p.weekPoints / p.weekGoal : 0} color={k.color} />
                {p.streakDays >= 2 ? <T size="small">🔥 {p.streakDays} dias seguidos</T> : null}
              </View>
            ) : null}
            {missions.map((i) => (
              <TaskRow key={i.id} task={i} members={members} compact onToggle={() => app.actions.toggle(i.id)} onPress={() => router.push({ pathname: '/tarefa/[id]', params: { id: i.id } })} />
            ))}
            {!missions.length ? <Empty emoji="🌈" text="Sem missões hoje." /> : null}
            {settings.gamification ? (
              <>
                <H2>🏆 Conquistas</H2>
                <Row wrap>
                  {p.achievements.map((a) => (
                    <View key={a.id} style={{ width: '31%', alignItems: 'center', padding: 6, opacity: a.earned ? 1 : 0.3 }}>
                      <Text style={{ fontSize: 28 }}>{a.emoji}</Text>
                      <T size="small" center>{a.title}</T>
                    </View>
                  ))}
                </Row>
              </>
            ) : null}
          </Card>
        );
      })}
      <Row>
        <Button label="Nova missão" icon="➕" kind="secondary" onPress={() => router.push({ pathname: '/modelo/[id]', params: { id: 'novo', missao: '1' } })} style={{ flex: 1 }} />
        <Button label="Lição da Inaê" icon="📚" kind="secondary" onPress={() => router.push('/licao')} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
