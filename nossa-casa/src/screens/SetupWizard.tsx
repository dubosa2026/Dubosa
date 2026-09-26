// Primeira abertura: revisa os dados já pré-cadastrados, em 7 passos curtos.
import { useState } from 'react';
import { Share, View } from 'react-native';
import { app, useNC } from '../data/app';
import { setupNotifications } from '../data/notifications';
import { CATEGORIES } from '../domain/categories';
import { describeRecurrence } from '../domain/recurrence';
import type { CategoryId, Member } from '../domain/types';
import { Banner, Button, Card, Chip, Field, H2, Progress, Row, Screen, T } from '../ui/components';
import { ScheduleEditor } from '../ui/ScheduleEditor';
import { useAdults, useKids } from '../ui/selectors';

const STEPS = ['Adultos', 'Crianças', 'Horários', 'Dias de trabalho', 'Preferências', 'Tarefas', 'Notificações'];

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const adults = useAdults();
  const kids = useKids();
  const templates = useNC((s) => s.templates);
  const household = useNC((s) => s.household)!;
  const meId = useNC((s) => s.meId);
  const [who, setWho] = useState(0);

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : app.actions.updateSettings({ onboarding_done: true }));

  return (
    <Screen title="Vamos configurar a rotina da família" subtitle={`Passo ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}>
      <Progress value={(step + 1) / STEPS.length} />
      <View style={{ height: 16 }} />
      {step === 0 ? (
        <Card>
          <H2>1. Nome dos adultos</H2>
          <T muted>Os dois são administradores, com exatamente o mesmo acesso.</T>
          {adults.map((m) => <NameField key={m.id} member={m} />)}
        </Card>
      ) : null}
      {step === 1 ? (
        <Card>
          <H2>2. Nome das crianças</H2>
          <T muted>Inaê e Ian já estão cadastrados — dá para trocar nomes e idades.</T>
          {kids.map((m) => <NameField key={m.id} member={m} withAge />)}
        </Card>
      ) : null}
      {step === 2 || step === 3 ? (
        <Card>
          <H2>{step === 2 ? '3. Horários' : '4. Dias de trabalho'}</H2>
          <T muted>
            {step === 2
              ? 'Marque quando cada um está em casa com as crianças de manhã, no jantar e à noite, e quanto tempo sobra para tarefas extras (já preservando descanso).'
              : 'Quarta-feira está como dia leve (os dois fora o dia todo). Sábado e domingo têm limite de tarefas extras.'}
          </T>
          <Row wrap style={{ marginVertical: 8 }}>
            {adults.map((a, i) => <Chip key={a.id} label={`${a.emoji} ${a.name}`} selected={who === i} onPress={() => setWho(i)} color={a.color} />)}
          </Row>
          {adults[who] ? <ScheduleEditor member={adults[who]} /> : null}
        </Card>
      ) : null}
      {step === 4 ? (
        <Card>
          <H2>5. Preferências</H2>
          <T muted>Preferência é peso, não exclusividade: o app ainda busca o equilíbrio geral.</T>
          {adults.map((a) => <PrefPicker key={a.id} member={a} />)}
        </Card>
      ) : null}
      {step === 5 ? (
        <Card>
          <H2>6. Tarefas</H2>
          <T muted>
            Já cadastramos {templates.filter((t) => !t.deleted && t.kind !== 'mission').length} tarefas da casa e{' '}
            {templates.filter((t) => t.kind === 'mission').length} missões das crianças, com frequências sugeridas. Dá para mudar tudo
            depois na aba Tarefas.
          </T>
          {templates.filter((t) => t.rule_tag).map((t) => (
            <T key={t.id} size="small">• {t.title} — {describeRecurrence(t.recurrence)}</T>
          ))}
          <Banner kind="info" text="Regras automáticas: quem cozinha lava a louça e limpa o fogão; quem lava a louça não faz a rotina de sono; enquanto um faz uma tarefa longa, o outro fica com as crianças." />
        </Card>
      ) : null}
      {step === 6 ? (
        <Card>
          <H2>7. Notificações</H2>
          <T muted>Lembretes de tarefas, mercado, lição da Inaê, roupas e passeios. Ajuste horários em Configurações.</T>
          <Button label="Permitir notificações" icon="🔔" kind="secondary" onPress={() => void setupNotifications()} style={{ marginTop: 12 }} />
          {household.invite_code ? (
            <>
              <Banner kind="success" text={`Código para o outro celular entrar na casa: ${household.invite_code}`} />
              <Button label="Enviar convite para o outro celular" icon="📤" onPress={() => {
                const message = app.connectionMessage();
                if (message) void Share.share({ message });
              }} />
            </>
          ) : null}
          {app.backend?.mode === 'demo' ? (
            <Banner kind="info" text={`Modo demonstração: você está como ${adults.find((a) => a.id === meId)?.name}. Em Configurações dá para trocar de pessoa.`} />
          ) : null}
        </Card>
      ) : null}
      <Row>
        {step > 0 ? <Button label="Voltar" kind="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
        <Button label={step === STEPS.length - 1 ? 'Começar ❤️' : 'Próximo'} onPress={next} style={{ flex: 2 }} />
      </Row>
      {step < STEPS.length - 1 ? <Button label="Pular — revisar depois" kind="ghost" small onPress={() => app.actions.updateSettings({ onboarding_done: true })} style={{ marginTop: 12 }} /> : null}
    </Screen>
  );
}

function NameField({ member, withAge }: { member: Member; withAge?: boolean }) {
  const [name, setName] = useState(member.name);
  return (
    <View style={{ marginTop: 8 }}>
      <Field label={`${member.emoji} Nome`} value={name} onChangeText={setName} onEndEditing={() => name.trim() && name !== member.name && app.actions.updateMember(member.id, { name: name.trim() })} />
      {withAge ? (
        <Field
          label="Idade aproximada"
          keyboardType="number-pad"
          defaultValue={member.age ? String(member.age) : ''}
          onEndEditing={(e) => app.actions.updateMember(member.id, { age: Number(e.nativeEvent.text) || null })}
        />
      ) : null}
    </View>
  );
}

export function PrefPicker({ member }: { member: Member }) {
  const prefs = member.preferences as Record<string, number>;
  const toggle = (id: CategoryId) => {
    const cur = prefs[id] ?? 0;
    const next = { ...prefs, [id]: cur >= 3 ? 0 : cur + 1 };
    if (!next[id]) delete next[id];
    app.actions.updateMember(member.id, { preferences: next });
  };
  return (
    <View style={{ marginTop: 12 }}>
      <T bold>{member.emoji} {member.name} prefere:</T>
      <T muted size="small">Toque para aumentar o peso (1 a 3 ★).</T>
      <Row wrap style={{ marginTop: 6 }}>
        {CATEGORIES.filter((c) => c.id !== 'cobertura' && c.id !== 'familia').map((c) => (
          <Chip
            key={c.id}
            label={`${c.emoji} ${c.label}${prefs[c.id] ? ' ' + '★'.repeat(prefs[c.id]) : ''}`}
            selected={!!prefs[c.id]}
            color={member.color}
            onPress={() => toggle(c.id)}
          />
        ))}
      </Row>
    </View>
  );
}
