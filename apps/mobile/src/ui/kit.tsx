import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type TextProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, font, space, TOUCH } from './theme';

/**
 * A screen on the orange ground that scrolls. Screens under a header (with a back arrow) pass
 * `header`, since the header already keeps clear of the status bar.
 */
export function Screen({ children, scroll = true, header = false }: { children: ReactNode; scroll?: boolean; header?: boolean }) {
  return (
    <SafeAreaView style={s.screen} edges={header ? ['left', 'right'] : ['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={s.screenBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[s.screenBody, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** The white field content sits on. */
export function Paper({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.paper, style]}>{children}</View>;
}

export function Title({ children, size = 34, ...rest }: TextProps & { size?: number }) {
  return <Text {...rest} style={[s.title, { fontSize: size, lineHeight: size * 1.05 }, rest.style]}>{children}</Text>;
}

export function Body({ children, muted, bold, small, ...rest }: TextProps & { muted?: boolean; bold?: boolean; small?: boolean }) {
  return (
    <Text
      {...rest}
      style={[s.body, muted && { color: color.paperMuted }, bold && { fontFamily: font.bold }, small && { fontSize: 14 }, rest.style]}
    >
      {children}
    </Text>
  );
}

/** The one button shape: a solid ink block, square corners. `ghost` is an underlined text link. */
export function Button({ label, onPress, busy, disabled, ghost, danger, style }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; ghost?: boolean; danger?: boolean; style?: ViewStyle;
}) {
  const off = disabled || busy;
  if (ghost) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} disabled={off} style={[s.ghost, style]} hitSlop={6}>
        <Text style={[s.ghostText, off && { opacity: 0.5 }]}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [s.button, danger && { backgroundColor: color.danger }, (off || pressed) && { opacity: off ? 0.55 : 0.85 }, style]}
    >
      {busy ? <ActivityIndicator color={danger ? '#fff' : color.bg} /> : <Text style={[s.buttonText, danger && { color: '#fff' }]}>{label}</Text>}
    </Pressable>
  );
}

/** A labelled text box; `secure` adds a Show / Hide switch. */
export function Field({ label, hint, secure, ...input }: TextInputProps & { label: string; hint?: string; secure?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputRow}>
        <TextInput
          placeholderTextColor="#8a8f94"
          {...input}
          secureTextEntry={secure && !shown}
          accessibilityLabel={label}
          style={[s.input, input.style]}
        />
        {secure ? (
          <Pressable onPress={() => setShown((v) => !v)} hitSlop={8} style={s.show} accessibilityRole="button">
            <Text style={s.ghostText}>{shown ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <Text accessibilityRole="alert" style={s.error}>{children}</Text>;
}

export function Note({ children }: { children?: string }) {
  if (!children) return null;
  return <Text accessibilityLiveRegion="polite" style={s.note}>{children}</Text>;
}

/** Loading, failed (with Try again) or empty states, all in one place so every screen says it the same way. */
export function State({ loading, error, empty, onRetry, children }: {
  loading?: string; error?: string; empty?: string; onRetry?: () => void; children?: ReactNode;
}) {
  return (
    <View style={s.state}>
      {loading ? <ActivityIndicator color={color.ink} /> : null}
      <Body muted>{loading ?? error ?? empty}</Body>
      {error && onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
      {children}
    </View>
  );
}

/** A small rotated ink label, like the website's stamps ("44% off", "MJK000003"). */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <View style={s.stamp}>
      <Text style={s.stampText}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  screenBody: { padding: space.margin, paddingBottom: 32, gap: space.gutter },
  paper: { backgroundColor: color.paper, padding: space.gutter, gap: 12 },
  title: { fontFamily: font.bold, color: color.ink, letterSpacing: -0.8 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, color: color.paperInk },
  button: { minHeight: TOUCH + 4, paddingHorizontal: 22, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  buttonText: { fontFamily: font.bold, fontSize: 17, color: color.bg },
  ghost: { minHeight: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  ghostText: { fontFamily: font.bold, fontSize: 15, color: color.paperInk, textDecorationLine: 'underline' },
  field: { gap: 6 },
  label: { fontFamily: font.bold, fontSize: 14, color: color.paperInk },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: color.paperInk, backgroundColor: color.paper },
  input: { flex: 1, minHeight: TOUCH, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 17, color: color.paperInk },
  show: { paddingHorizontal: 12, minHeight: TOUCH, justifyContent: 'center' },
  hint: { fontFamily: font.regular, fontSize: 13, color: color.paperMuted },
  error: { fontFamily: font.medium, fontSize: 15, color: color.danger },
  note: { fontFamily: font.medium, fontSize: 15, color: color.paperInk },
  state: { gap: 14, paddingVertical: 32, alignItems: 'flex-start' },
  stamp: { alignSelf: 'flex-start', backgroundColor: color.ink, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '-2deg' }] },
  stampText: { fontFamily: font.bold, fontSize: 13, color: color.bg },
});
