import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { api } from '@/lib/api';
import { firstMessage, OFFLINE } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, ErrorText, Field, Paper, Screen, Title } from '@/ui/kit';

/** New buyers make their own account and are logged straight in. No email code. */
export default function Signup() {
  const { signIn } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function check() {
    if (!name.trim()) return 'Tell us your name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter your email address, like you@example.com.';
    if (!/^[6-9]\d{9}$/.test(phone)) return 'Enter a 10-digit mobile number.';
    if (password.length < 8) return 'Choose a password of at least 8 characters.';
    return '';
  }

  async function submit() {
    const problem = check();
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      const { data, error: e } = await api.POST('/api/v1/auth/signup/', {
        body: { name: name.trim(), email: email.trim(), phone, password },
      });
      if (data) await signIn(data);
      else setError(firstMessage(e) ?? 'We couldn’t make your account. Please check your details.');
    } catch {
      setError(OFFLINE);
    }
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header>
        <Paper style={{ gap: 16, paddingVertical: 24 }}>
          <Title size={30}>Create your account</Title>
          <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Mobile number"
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            autoComplete="tel"
            placeholder="9876543210"
          />
          <Field
            label="Password"
            secure
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            hint="At least 8 characters. Log in with your email and this password."
          />
          <ErrorText>{error}</ErrorText>
          <Button label="Create account" onPress={submit} busy={busy} />
        </Paper>
      </Screen>
    </KeyboardAvoidingView>
  );
}
