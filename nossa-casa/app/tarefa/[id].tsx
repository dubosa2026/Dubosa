// Detalhe de uma tarefa do dia: concluir, cronômetro, responsável, adiar, histórico.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { app, useNC } from '@/src/data/app';
import { category, EFFORT_INFO, PRIORITY_INFO } from '@/src/domain/categories';
import { addDays, formatLong, formatMinutes, formatShort } from '@/src/domain/dates';
import { Banner, Button, Card, Chip, Empty, Field, H2, Row, Screen, T } from '@/src/ui/components';
import { ACTION } from '@/src/ui/labels';
import { useAdults, useDayTimes, useToday } from '@/src/ui/selectors';
import { useColors } from '@/src/ui/theme';

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const today = useToday();
  const task = useNC((s) => s.instances.find((i) => i.id === id));
  const members = useNC((s) => s.members);
  const logs = useNC((s) => s.logs);
  const pair = useNC((s) => s.instances.find((i) => task && (i.id === task.group_id || (i.group_id === task.id && i.kind === 'coverage'))));
  const adults = useAdults();
  const [reasons, setReasons] = useState<string[]>([]);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!task?.timer_started_at) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [task?.timer_started_at]);

  if (!task) return <Screen><Empty emoji="🔎" text="Tarefa não encontrada." /></Screen>;
  const name = (mid: string | null) => members.find((m) => m.id === mid)?.name ?? '—';
  const done = task.status === 'done';
  const running = task.timer_started_at ? Math.round((Date.now() - Date.parse(task.timer_started_at)) / 1000) : 0;
  const elapsed = task.actual_seconds + running;
  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const isMission = task.kind === 'mission';
  const shared = task.assignee_ids.length > 1;
  const history = logs.filter((l) => l.entity_id === task.id).slice(0, 10);

  const setWho = (ids: string[]) => {
    if (!ids.length) return;
    setReasons(app.actions.setAssignees(task.id, ids));
  };
  const toggleWho = (mid: string) => {
    if (shared || task.assignee_ids.length === 0) {
      const next = task.assignee_ids.includes(mid) ? task.assignee_ids.filter((x) => x !== mid) : [...task.assignee_ids, mid];
      setWho(next);
    } else setWho([mid]);
  };

  return (
    <Screen>
      <Card>
        <T size="big" bold>{category(task.category).emoji} {task.title}</T>
        <T muted>{formatLong(task.date)}{task.due_time ? ` · ${task.due_time}` : ''}</T>
        <Row wrap style={{ marginTop: 8 }}>
          <T size="small">⏱ {formatMinutes(task.minutes)}</T>
          <T size="small">· {EFFORT_INFO[task.effort].label}</T>
          <T size="small">· {PRIORITY_INFO[task.priority].emoji} {PRIORITY_INFO[task.priority].label}</T>
        </Row>
        {task.notes ? <T muted style={{ marginTop: 8 }}>{task.notes}</T> : null}
        {task.kind === 'coverage' ? <Banner kind="info" text="Cobertura das crianças: acontece junto com a tarefa do outro adulto — é uma única janela de organização familiar." /> : null}
        {pair && task.kind !== 'coverage' && pair.kind === 'coverage' ? <Banner kind="info" text={`Enquanto isso, ${name(pair.assignee_ids[0])} fica com as crianças.`} /> : null}
        {task.rule_tag === 'dishes' || task.rule_tag === 'stove' ? <Banner kind="info" text="Regra da cozinha: quem cozinha lava a louça e limpa o fogão." /> : null}
        {task.rule_tag === 'sleep_routine' ? <Banner kind="info" text="Quem lava a louça não faz a rotina de sono naquele dia." /> : null}
      </Card>

      <Button
        label={done ? 'Reabrir tarefa' : 'Concluir'}
        icon={done ? '↩️' : '✅'}
        kind={done ? 'secondary' : 'success'}
        onPress={() => { app.actions.toggle(task.id); if (!done) router.back(); }}
      />
      {shared && !done ? (
        <Button
          label={task.completed_by.includes(app.store.state.meId ?? '') ? 'Remover minha participação' : 'Registrar minha participação'}
          icon="👥"
          kind="secondary"
          onPress={() => app.actions.participate(task.id)}
          style={{ marginTop: 8 }}
        />
      ) : null}
      {task.completed_by.length ? <T muted size="small" style={{ marginTop: 6 }}>Feito por: {task.completed_by.map(name).join(' + ')}</T> : null}

      {!done && !isMission ? (
        <Card style={{ marginTop: 12 }}>
          <H2>Cronômetro (opcional)</H2>
          <T size="huge" bold center>{mm}</T>
          <T muted size="small" center>Serve só para o planejamento aprender quanto tempo a tarefa leva.</T>
          <Row style={{ marginTop: 8 }}>
            {task.timer_started_at ? (
              <Button label="PAUSAR" icon="⏸" kind="secondary" onPress={() => app.actions.pauseTimer(task.id)} style={{ flex: 1 }} />
            ) : (
              <Button label="INICIAR" icon="▶" kind="secondary" onPress={() => app.actions.startTimer(task.id)} style={{ flex: 1 }} />
            )}
            <Button label="CONCLUIR" icon="✅" kind="success" onPress={() => { app.actions.complete(task.id); router.back(); }} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : null}

      {!isMission && !done ? <TimeCard id={task.id} date={task.date} dueTime={task.due_time} /> : null}

      {!isMission ? (
        <Card style={{ marginTop: 12 }}>
          <H2>Responsável</H2>
          <Row wrap>
            {adults.map((a) => <Chip key={a.id} label={`${a.emoji} ${a.name}`} selected={task.assignee_ids.includes(a.id)} color={a.color} onPress={() => toggleWho(a.id)} />)}
            <Chip label="👥 Os dois" selected={shared} onPress={() => setWho(adults.map((a) => a.id))} />
          </Row>
          {reasons.map((r) => <Banner key={r} kind="info" text={`Ajustado automaticamente: ${r}`} />)}
        </Card>
      ) : null}

      {!done ? (
        <Card>
          <H2>Adiar ou mudar o dia</H2>
          <Row wrap>
            <Chip label="+1 dia" onPress={() => { app.actions.postpone(task.id, 1); router.back(); }} />
            <Chip label="+2 dias" onPress={() => { app.actions.postpone(task.id, 2); router.back(); }} />
            <Chip label="Próxima semana" onPress={() => { app.actions.postpone(task.id, 7); router.back(); }} />
          </Row>
          <T muted size="small">Mover para:</T>
          <Row wrap>
            {Array.from({ length: 7 }, (_, k) => addDays(today, k)).filter((d) => d !== task.date).map((d) => (
              <Chip key={d} label={formatShort(d)} onPress={() => app.actions.moveTo(task.id, d)} />
            ))}
          </Row>
        </Card>
      ) : null}

      <Card>
        <H2>Registro</H2>
        <T muted size="small">Criada por {name(task.created_by)} em {new Date(task.created_at).toLocaleString()}</T>
        <T muted size="small">Última alteração por {name(task.updated_by)} em {new Date(task.updated_at).toLocaleString()}</T>
        {task.completed_at ? <T muted size="small">Concluída em {new Date(task.completed_at).toLocaleString()}</T> : null}
        {task.postponed_count ? <T muted size="small">Adiada {task.postponed_count}×</T> : null}
        {history.map((l) => (
          <T key={l.id} size="small">• {name(l.actor_id)} {ACTION[l.action] ?? l.action}{l.details.to ? ` → ${String(l.details.to)}` : ''} ({new Date(l.created_at).toLocaleString()})</T>
        ))}
      </Card>

      <View style={{ gap: 8 }}>
        {task.template_id ? <Button kind="ghost" label="Editar tarefa cadastrada (frequência, peso…)" onPress={() => router.push({ pathname: '/modelo/[id]', params: { id: task.template_id! } })} /> : null}
        {!done ? <Button kind="danger" label="Cancelar esta ocorrência" onPress={() => { app.actions.cancel(task.id); router.back(); }} /> : null}
        {!task.template_id ? <Button kind="danger" label="Excluir" onPress={() => { app.actions.removeInstance(task.id); router.back(); }} /> : null}
      </View>
      <View style={{ height: 1, backgroundColor: c.border, marginTop: 16 }} />
    </Screen>
  );
}

function TimeCard({ id, date, dueTime }: { id: string; date: string; dueTime: string | null }) {
  const times = useDayTimes(date);
  const current = times.get(id);
  const [text, setText] = useState(dueTime ?? '');
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
  return (
    <Card style={{ marginTop: 12 }}>
      <H2>Horário</H2>
      <T muted size="small">
        {dueTime ? `Marcado para ${dueTime}.` : current ? `Sugerido: ${current.time} (encaixado quando você está em casa). Marque um horário para receber lembrete.` : 'Sem horário.'}
      </T>
      <Row style={{ marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Field label="Horário (HH:MM)" value={text} onChangeText={setText} placeholder={current?.time ?? '19:30'} keyboardType="numbers-and-punctuation" />
        </View>
        <Button small label="Salvar" disabled={!valid || text === dueTime} onPress={() => app.actions.updateInstance(id, { due_time: text })} />
      </Row>
      {dueTime ? <Button small kind="ghost" label="Voltar para horário sugerido" onPress={() => { setText(''); app.actions.updateInstance(id, { due_time: null }); }} /> : null}
    </Card>
  );
}
