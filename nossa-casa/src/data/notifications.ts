// Notificações locais (funcionam sem servidor de push): o próprio celular agenda
// os lembretes das tarefas da pessoa que está usando. Sempre que os dados mudam,
// a agenda é refeita. Mudanças feitas pelo outro também geram um aviso na hora.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { planNotifications } from '../domain/notifyPlan';
import type { Household, Member, Snapshot } from '../domain/types';

let configured = false;
let lastSignature = '';

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!configured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('rotina', {
        name: 'Rotina da casa',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync('familia', {
        name: 'Mudanças da família',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    configured = true;
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Refaz a agenda de lembretes deste celular. */
export async function rescheduleNotifications(h: Household | null, me: Member | undefined, snap: Pick<Snapshot, 'instances' | 'events'>) {
  if (Platform.OS === 'web' || !h || !me) return;
  const plan = planNotifications(h, me, snap.instances, snap.events, new Date());
  const signature = plan.map((p) => `${p.id}@${p.at.getTime()}:${p.body}`).join('|');
  if (signature === lastSignature) return;
  lastSignature = signature;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const p of plan) {
      await Notifications.scheduleNotificationAsync({
        content: { title: p.title, body: p.body, data: { kind: p.kind } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: 'rotina' },
      });
    }
  } catch {
    lastSignature = '';
  }
}

/** Aviso imediato quando o outro adulto muda algo (ex.: "Jussara concluiu: Limpar banheiro"). */
export async function notifyPartnerChange(text: string) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Nossa Casa', body: text },
      trigger: null,
    });
  } catch {
    // sem permissão: ignora
  }
}

export async function sendTestNotification() {
  if (Platform.OS === 'web') return false;
  const ok = await setupNotifications();
  if (!ok) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Nossa Casa ❤️', body: 'As notificações estão funcionando!' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: 'rotina' },
  });
  return true;
}
