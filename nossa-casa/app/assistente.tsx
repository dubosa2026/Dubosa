// Nossa Casa IA — responde com os dados reais da família.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { app } from '@/src/data/app';
import { answerLocally, type AssistantAnswer } from '@/src/domain/assistant';
import { today } from '@/src/domain/dates';
import { Button, Chip, Row, T } from '@/src/ui/components';
import { font, useColors } from '@/src/ui/theme';

const QUICK = [
  'Quem precisa fazer o quê hoje?',
  'O que está atrasado?',
  'Quais tarefas temos amanhã?',
  'Como está a distribuição desta semana?',
  'Temos alguma tarefa de roupa hoje?',
  'O que precisamos comprar?',
  'Organize minha semana.',
  'Quais tarefas de limpeza pesada estão pendentes?',
];

interface Msg { from: 'me' | 'ai'; text: string; action?: AssistantAnswer['action'] }

export default function Assistant() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'ai', text: 'Olá! Sou a Nossa Casa IA. Pergunte sobre as tarefas, a semana, as compras… Eu olho os dados reais da casa. 🏡' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setText('');
    setMsgs((m) => [...m, { from: 'me', text: q }]);
    setBusy(true);
    const s = app.store.state;
    let answer: AssistantAnswer = answerLocally(q, s, today());
    const useCloud = app.backend?.mode === 'cloud' && s.household?.settings.ai_enabled && !answer.action && app.sb;
    if (useCloud) {
      try {
        const { data, error } = await app.sb!.functions.invoke('assistant', { body: { question: q, today: today(), member_id: s.meId } });
        if (!error && data?.answer) answer = { text: String(data.answer), action: data.action === 'reorganize' ? 'reorganize' : undefined };
      } catch {
        // sem internet ou função não publicada: fica com a resposta local
      }
    }
    setMsgs((m) => [...m, { from: 'ai', text: answer.text, action: answer.action }]);
    setBusy(false);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 10 }}>
        {msgs.map((m, i) => (
          <View key={i} style={{ alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: m.from === 'me' ? c.primary : c.card, borderRadius: 16, padding: 12, borderWidth: m.from === 'me' ? 0 : 1, borderColor: c.border }}>
            <T style={m.from === "me" ? { color: "#fff" } : undefined}>{m.text}</T>
            {m.action === 'reorganize' ? <Button small label="Ver nova distribuição" onPress={() => router.push('/reorganizar')} style={{ marginTop: 8 }} /> : null}
            {m.action === 'shopping' ? <Button small kind="secondary" label="Abrir lista de compras" onPress={() => router.push('/mercado')} style={{ marginTop: 8 }} /> : null}
          </View>
        ))}
        {busy ? <T muted>Pensando…</T> : null}
        <Row wrap style={{ marginTop: 8 }}>{QUICK.map((q) => <Chip key={q} label={q} onPress={() => void ask(q)} />)}</Row>
      </ScrollView>
      <Row style={{ padding: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Pergunte algo…"
          placeholderTextColor={c.muted}
          onSubmitEditing={() => void ask(text)}
          returnKeyType="send"
          style={{ flex: 1, fontSize: font.body, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
        />
        <Button small label="Enviar" onPress={() => void ask(text)} disabled={!text.trim() || busy} />
      </Row>
    </View>
  );
}
