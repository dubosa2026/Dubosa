import { Pressable, Text } from 'react-native';
import { app, useNC } from '../data/app';
import { useColors } from './theme';

export function SyncBadge() {
  const c = useColors();
  const sync = useNC((s) => s.sync);
  if (app.backend?.mode !== 'cloud') {
    return <Text style={{ color: c.muted, fontSize: 12 }}>🧪 demonstração</Text>;
  }
  let label = '✓ sincronizado';
  let color = c.success;
  if (!sync.online) {
    label = `☁️ offline${sync.pending ? ` · ${sync.pending} p/ enviar` : ''}`;
    color = c.warn;
  } else if (sync.syncing || sync.pending) {
    label = '↻ sincronizando';
    color = c.info;
  } else if (sync.error) {
    label = '⚠️ erro';
    color = c.danger;
  }
  return (
    <Pressable onPress={() => void app.refresh()} accessibilityLabel={`Sincronização: ${label}. Toque para sincronizar.`} hitSlop={8}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
