import { useState } from 'react';

import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { firstMessage, OFFLINE } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorText, Field, Note, Paper, Screen, Title } from '@/ui/kit';

export default function Account() {
  const { user, setUser, signOut } = useSession();
  const cart = useCart();
  const [name, setName] = useState(user?.first_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNote, setPwNote] = useState('');
  const [pwError, setPwError] = useState('');

  async function saveDetails() {
    if (!name.trim()) return setError('Type your name, so the courier knows who to ask for.');
    if (phone && !/^\d{10}$/.test(phone)) return setError('Type a 10-digit mobile number, like 9876543210.');
    setSaving(true);
    setError('');
    setNote('');
    try {
      const { data, error: e } = await api.PATCH('/api/v1/me/', { body: { first_name: name.trim(), phone } });
      if (data) {
        await setUser(data);
        setNote('Saved.');
      } else setError(firstMessage(e) ?? 'That didn’t save. Please try again.');
    } catch {
      setError(OFFLINE);
    }
    setSaving(false);
  }

  async function savePassword() {
    if (pw.length < 8) return setPwError('Use at least 8 characters.');
    if (pw !== pw2) return setPwError('The two passwords don’t match. Type them again.');
    setPwBusy(true);
    setPwError('');
    setPwNote('');
    try {
      const { response, error: e } = await api.POST('/api/v1/me/password/', { body: { password: pw } });
      if (response.ok) {
        setPw('');
        setPw2('');
        setPwNote('Your new password is set. Use it next time you log in.');
      } else setPwError(firstMessage(e) ?? 'That didn’t save. Please try again.');
    } catch {
      setPwError(OFFLINE);
    }
    setPwBusy(false);
  }

  async function logOut() {
    cart.clear();
    await signOut();
  }

  return (
    <Screen>
      <Title>Your account</Title>
      <Body>Logged in as <Body bold>{user?.email}</Body></Body>
      <Paper>
        <Title size={24}>Your details</Title>
        <Field label="Name" value={name} onChangeText={setName} autoComplete="name" />
        <Field label="Mobile number" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" />
        <ErrorText>{error}</ErrorText>
        <Note>{note}</Note>
        <Button label="Save details" onPress={saveDetails} busy={saving} />
      </Paper>
      <Paper>
        <Title size={24}>Password</Title>
        <Body small muted>Pick a new password for this account.</Body>
        <Field label="New password" secure value={pw} onChangeText={setPw} autoComplete="new-password" />
        <Field label="Type it again" secure value={pw2} onChangeText={setPw2} autoComplete="new-password" />
        <ErrorText>{pwError}</ErrorText>
        <Note>{pwNote}</Note>
        <Button label="Set new password" onPress={savePassword} busy={pwBusy} />
      </Paper>
      <Button label="Log out" onPress={() => void logOut()} />
    </Screen>
  );
}
