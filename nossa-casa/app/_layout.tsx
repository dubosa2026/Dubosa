import '@/src/data/polyfills';
import { useLinkingURL } from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { app, useNC, usePhase } from '@/src/data/app';
import { decodeConnection } from '@/src/domain/connection';
import { LoginScreen } from '@/src/screens/Login';
import { OnboardingScreen } from '@/src/screens/Onboarding';
import { ServerScreen } from '@/src/screens/Server';
import { SetupWizard } from '@/src/screens/SetupWizard';
import { useColors } from '@/src/ui/theme';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const phase = usePhase();
  const c = useColors();
  const onboarded = useNC((s) => s.household?.settings.onboarding_done ?? true);

  useEffect(() => {
    app.init().catch((e) => {
      console.warn(e);
    });
  }, []);

  // Link "Toque para conectar" enviado pelo outro celular.
  const url = useLinkingURL();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!url || handled.current === url || phase === 'loading') return;
    const info = decodeConnection(url);
    if (!info) return;
    handled.current = url;
    app.applyConnection(info).catch((e) => console.warn(e));
  }, [url, phase]);

  let content;
  if (phase === 'loading') {
    content = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, gap: 12 }}>
        <Text style={{ fontSize: 48 }}>🏡</Text>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>Nossa Casa</Text>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  } else if (phase === 'server') content = <ServerScreen />;
  else if (phase === 'login') content = <LoginScreen />;
  else if (phase === 'onboarding') content = <OnboardingScreen />;
  else if (!onboarded) content = <SetupWizard />;
  else {
    content = (
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: c.bg },
          headerShadowVisible: false,
          headerBackTitle: 'Voltar',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tarefa/[id]" options={{ title: 'Tarefa', presentation: 'modal' }} />
        <Stack.Screen name="modelo/[id]" options={{ title: 'Tarefa cadastrada' }} />
        <Stack.Screen name="nova" options={{ title: 'Nova tarefa', presentation: 'modal' }} />
        <Stack.Screen name="mercado" options={{ title: '🛒 Mercado' }} />
        <Stack.Screen name="criancas" options={{ title: '🧸 Crianças' }} />
        <Stack.Screen name="licao" options={{ title: '📚 Lição de casa' }} />
        <Stack.Screen name="historico" options={{ title: 'Histórico' }} />
        <Stack.Screen name="assistente" options={{ title: 'Nossa Casa IA' }} />
        <Stack.Screen name="reorganizar" options={{ title: 'Reorganizar semana', presentation: 'modal' }} />
        <Stack.Screen name="disponibilidade" options={{ title: 'Horários e divisão' }} />
        <Stack.Screen name="membro/[id]" options={{ title: 'Pessoa' }} />
        <Stack.Screen name="conectar" options={{ headerShown: false }} />
      </Stack>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {content}
    </SafeAreaProvider>
  );
}
