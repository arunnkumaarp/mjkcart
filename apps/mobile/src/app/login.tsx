import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { api } from '@/lib/api';
import { firstMessage, OFFLINE } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useShop } from '@/lib/shop';
import { Body, Button, ErrorText, Field, Paper, Screen, Title } from '@/ui/kit';

/** One login for everyone: username or email, and password. */
export default function Login() {
  const shop = useShop();
  const { signIn } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!username.trim() || !password) return setError('Type your email (or username) and password.');
    setBusy(true);
    setError('');
    try {
      const { data, error: e } = await api.POST('/api/v1/auth/login/', { body: { username: username.trim(), password } });
      if (data) await signIn(data);
      else setError(firstMessage(e) ?? 'Wrong username or password.');
    } catch {
      setError(OFFLINE);
    }
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ paddingTop: 48, paddingBottom: 16, alignItems: 'center' }}>
          <Title size={44}>{shop?.shop_name ?? 'MJK Cart'}</Title>
          {shop?.tagline ? <Body style={{ marginTop: 6 }}>{shop.tagline}</Body> : null}
        </View>
        <Paper style={{ gap: 16, paddingVertical: 24 }}>
          <Title size={32}>Log in</Title>
          <Field
            label="Email or username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
          />
          <Field
            label="Password"
            secure
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <ErrorText>{error}</ErrorText>
          <Button label="Log in" onPress={submit} busy={busy} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Body muted small>New here?</Body>
            <Button ghost label="Create an account" onPress={() => router.push('/signup')} />
          </View>
        </Paper>
      </Screen>
    </KeyboardAvoidingView>
  );
}
