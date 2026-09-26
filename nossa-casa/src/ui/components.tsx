import { type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { category, PRIORITY_INFO } from '../domain/categories';
import { formatMinutes } from '../domain/dates';
import type { Member, TaskInstance } from '../domain/types';
import { font, radius, space, useColors } from './theme';

export function Screen({ children, title, subtitle, right, scroll = true, padded = true }: {
  children: ReactNode; title?: string; subtitle?: string; right?: ReactNode; scroll?: boolean; padded?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={[styles.header, { paddingTop: insets.top + space.m }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.h1, { color: c.text }]} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[styles.sub, { color: c.muted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : <View style={{ height: insets.top }} />;
  const body = padded ? { padding: space.l, paddingBottom: 48 + insets.bottom } : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, body]}>{children}</View>
      )}
    </View>
  );
}

export function Card({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: tint ?? c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.h2row}>
      <Text style={[styles.h2, { color: c.text }]} accessibilityRole="header">{children}</Text>
      {right}
    </View>
  );
}

export function T({ children, muted, size = 'body', bold, style, center, numberOfLines }: {
  children: ReactNode; muted?: boolean; size?: keyof typeof font; bold?: boolean; style?: StyleProp<TextStyle>; center?: boolean; numberOfLines?: number;
}) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? c.muted : c.text, fontSize: font[size], fontWeight: bold ? '700' : '400', textAlign: center ? 'center' : undefined }, style]}>
      {children}
    </Text>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, disabled, loading, small, style }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'; icon?: string;
  disabled?: boolean; loading?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: c.soft, ghost: 'transparent', danger: c.dangerSoft, success: c.success }[kind];
  const fg = { primary: c.primaryText, secondary: c.text, ghost: c.primary, danger: c.danger, success: '#fff' }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, borderColor: kind === 'ghost' ? c.border : bg },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <Text style={{ color: fg, fontSize: small ? font.small + 1 : font.body, fontWeight: '700', textAlign: 'center' }}>
          {icon ? `${icon}  ` : ''}{label}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const c = useColors();
  const active = color ?? c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? active : c.border, backgroundColor: selected ? active : c.card }]}
    >
      <Text style={{ color: selected ? '#fff' : c.text, fontSize: font.small + 1, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style, gap = space.s, wrap }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.m }}>
      <Text style={{ color: c.muted, fontSize: font.small, marginBottom: 6, fontWeight: '600' }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
      />
      {hint ? <Text style={{ color: c.muted, fontSize: font.small - 1, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

export function Checkbox({ checked, onPress, label, color }: { checked: boolean; onPress: () => void; label?: string; color?: string }) {
  const c = useColors();
  const col = color ?? c.success;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={[styles.check, { borderColor: checked ? col : c.muted, backgroundColor: checked ? col : 'transparent' }]}
    >
      {checked ? <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>✓</Text> : null}
    </Pressable>
  );
}

export function Avatar({ member, size = 36 }: { member?: Member; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: member?.color ?? '#999', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.55 }}>{member?.emoji ?? '🙂'}</Text>
    </View>
  );
}

export function TaskRow({ task, members, onToggle, onPress, showWho, late, compact, time }: {
  task: TaskInstance; members: Member[]; onToggle: () => void; onPress?: () => void; showWho?: boolean; late?: boolean; compact?: boolean;
  time?: { time: string; suggested: boolean };
}) {
  const c = useColors();
  const done = task.status === 'done';
  const cat = category(task.category);
  const who = task.assignee_ids.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(' + ');
  const meta: string[] = [];
  if (time) meta.push(time.suggested ? `🕘 ${time.time}` : `⏰ ${time.time}`);
  else if (task.due_time) meta.push(`⏰ ${task.due_time}`);
  if (!compact) meta.push(formatMinutes(task.minutes));
  if (task.assignee_ids.length > 1) meta.push('👥 juntos');
  if (task.kind === 'coverage') meta.push('🤝 simultânea');
  if (task.rule_tag === 'dishes' || task.rule_tag === 'stove') meta.push('🍳 de quem cozinhou');
  if (showWho && who) meta.push(who);
  if (task.timer_started_at) meta.push('⏱ em andamento');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.taskRow, { borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
      <Checkbox checked={done} onPress={onToggle} label={task.title} />
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: done ? c.muted : c.text, fontSize: font.body, fontWeight: '600', textDecorationLine: done ? 'line-through' : 'none' }}
        >
          {cat.emoji} {task.title}
        </Text>
        {meta.length ? <Text style={{ color: late ? c.danger : c.muted, fontSize: font.small, marginTop: 2 }}>{late ? '⚠️ atrasada · ' : ''}{meta.join(' · ')}</Text> : null}
      </View>
      {task.status === 'pending' && task.priority === 'high' && !compact ? <Text>{PRIORITY_INFO.high.emoji}</Text> : null}
    </Pressable>
  );
}

export function Empty({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: space.l }}>
      <Text style={{ fontSize: 34 }}>{emoji}</Text>
      <T muted center>{text}</T>
    </View>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const c = useColors();
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: c.soft, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color ?? c.success }} />
    </View>
  );
}

export function Banner({ text, kind = 'info', children }: { text: string; kind?: 'info' | 'warn' | 'success' | 'danger'; children?: ReactNode }) {
  const c = useColors();
  const bg = { info: c.infoSoft, warn: c.warnSoft, success: c.successSoft, danger: c.dangerSoft }[kind];
  const fg = { info: c.info, warn: c.warn, success: c.success, danger: c.danger }[kind];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: font.small + 1, fontWeight: '600' }}>{text}</Text>
      {children}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.soft }]}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.value === value }}
          style={[styles.segment, o.value === value && { backgroundColor: c.card }]}
        >
          <Text style={{ color: c.text, fontWeight: o.value === value ? '700' : '500', fontSize: font.small + 1 }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: space.l, paddingBottom: space.s },
  h1: { fontSize: font.big, fontWeight: '800' },
  sub: { fontSize: font.small + 1, marginTop: 2 },
  h2row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.l, marginBottom: space.s },
  h2: { fontSize: font.title, fontWeight: '800' },
  card: { borderRadius: radius.l, borderWidth: 1, padding: space.l, marginBottom: space.m },
  button: { minHeight: 52, borderRadius: radius.m, paddingHorizontal: space.l, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  buttonSmall: { minHeight: 40, paddingHorizontal: space.m },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, marginRight: 6, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: radius.s, paddingHorizontal: 14, paddingVertical: 12, fontSize: font.body },
  check: { width: 30, height: 30, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  banner: { borderRadius: radius.m, padding: space.m, marginBottom: space.m, gap: space.s },
  segmented: { flexDirection: 'row', borderRadius: radius.m, padding: 4, marginBottom: space.m },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.s },
});
