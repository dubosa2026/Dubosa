import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/src/ui/theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
  };

// Rótulo que encolhe um pouco se não couber (ex.: "Configurações" em telas estreitas).
const label = (text: string) =>
  function TabLabel({ color }: { color: ColorValue }) {
    return (
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color, fontSize: text.length > 10 ? 10 : 11, fontWeight: '700', letterSpacing: -0.3 }}>
        {text}
      </Text>
    );
  };

export default function TabLayout() {
  const c = useColors();
  // Deixa espaço para a barra de navegação do Android (botões ◁ ○ ▢ ou gestos).
  const insets = useSafeAreaInsets();
  const tab = (title: string, emoji: string) => ({ title, tabBarIcon: icon(emoji), tabBarLabel: label(title) });
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, height: 60 + insets.bottom, paddingBottom: 6 + insets.bottom, paddingTop: 6 },
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}
    >
      <Tabs.Screen name="index" options={tab('Hoje', '☀️')} />
      <Tabs.Screen name="semana" options={tab('Semana', '📅')} />
      <Tabs.Screen name="tarefas" options={tab('Tarefas', '🧹')} />
      <Tabs.Screen name="familia" options={tab('Família', '❤️')} />
      <Tabs.Screen name="ajustes" options={tab('Configurações', '⚙️')} />
    </Tabs>
  );
}
