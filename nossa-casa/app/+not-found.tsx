import { Link, Stack } from 'expo-router';
import { Screen, T } from '@/src/ui/components';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Ops!' }} />
      <Screen>
        <T center>Esta tela não existe.</T>
        <Link href="/" style={{ marginTop: 16, textAlign: 'center', color: '#D8664F', fontSize: 17 }}>Voltar para Hoje</Link>
      </Screen>
    </>
  );
}
