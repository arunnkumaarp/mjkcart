import type { Address, Quote } from '@mjkcart/api';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { firstMessage, money, OFFLINE } from '@/lib/format';
import { Body, Button, ErrorText, Field, Paper, Screen, State, Title } from '@/ui/kit';
import { color, font } from '@/ui/theme';

type Method = 'upi' | 'cod';
const BLANK = { name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' };

/** Two steps, like the website: where it goes, how to pay. The total is the shop's own quote. */
export default function Checkout() {
  const cart = useCart();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [method, setMethod] = useState<Method>('upi');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.GET('/api/v1/me/addresses/');
        const list = data ?? [];
        setAddresses(list);
        setChosen((list.find((a) => a.is_default) ?? list[0])?.id ?? null);
        setAdding(!list.length);
      } catch {
        setError(OFFLINE);
      }
      setLoading(false);
    })();
  }, []);

  const requote = useCallback(async () => {
    if (!chosen) return;
    setQuoting(true);
    setError('');
    try {
      const { data } = await api.POST('/api/v1/checkout/quote/', { body: { address: chosen, payment_method: method, coupon: '' } });
      setQuote(data ?? null);
      setProblems(data?.problems ?? []);
      if (!data) setError('We couldn’t work out the total. Please try again.');
    } catch {
      setError(OFFLINE);
    }
    setQuoting(false);
  }, [chosen, method]);
  useEffect(() => void requote(), [requote]);

  async function saveAddress() {
    const f = form;
    const problem =
      !f.name.trim() ? 'Who should we hand the parcel to?' :
      !/^[6-9]\d{9}$/.test(f.phone) ? 'Enter a 10-digit mobile number for the courier.' :
      !f.line1.trim() ? 'Enter the house number and street.' :
      !f.city.trim() || !f.state.trim() ? 'Enter the city and state.' :
      !/^[1-9]\d{5}$/.test(f.pincode) ? 'Enter a 6-digit pincode.' : '';
    if (problem) return setAddressError(problem);
    setSavingAddress(true);
    setAddressError('');
    try {
      const { data, error: e } = await api.POST('/api/v1/me/addresses/', { body: { ...f, is_default: !addresses.length } });
      if (data) {
        setAddresses((l) => [...l, data]);
        setChosen(data.id);
        setAdding(false);
        setForm(BLANK);
      } else setAddressError(firstMessage(e) ?? 'We couldn’t save that address. Please check it and try again.');
    } catch {
      setAddressError(OFFLINE);
    }
    setSavingAddress(false);
  }

  async function place() {
    if (!chosen || !quote || problems.length) return;
    setPlacing(true);
    setError('');
    try {
      const { data, error: e } = await api.POST('/api/v1/orders/', { body: { address: chosen, payment_method: method, coupon: '' } });
      if (data?.number) {
        await cart.load();
        router.replace(`/order/${data.number}`);
        return;
      }
      const refused = e as { detail?: string; problems?: string[] } | undefined;
      setProblems(refused?.problems ?? []);
      setError(refused?.detail ?? 'We couldn’t place the order. Please try again.');
    } catch {
      setError('We can’t reach the shop right now. Your order wasn’t placed; please try again.');
    }
    setPlacing(false);
  }

  const set = (k: keyof typeof BLANK) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  if (loading) return <Screen header><State loading="Getting your addresses…" /></Screen>;

  return (
    <Screen header>
      <Paper>
        <Title size={24}>1  Where should it go?</Title>
        {addresses.map((a) => (
          <Pressable key={a.id} onPress={() => setChosen(a.id)} accessibilityRole="radio" accessibilityState={{ checked: chosen === a.id }}
            style={[s.choice, chosen === a.id && s.on]}>
            <View style={[s.radio, chosen === a.id && s.radioOn]} />
            <View style={{ flex: 1 }}>
              <Body bold>{a.name} · {a.phone}</Body>
              <Body small>{a.line1}{a.line2 ? `, ${a.line2}` : ''}{a.landmark ? `, near ${a.landmark}` : ''}</Body>
              <Body small>{a.city}, {a.state} {a.pincode}</Body>
            </View>
          </Pressable>
        ))}
        {adding ? (
          <View style={{ gap: 12 }}>
            <Field label="Name" value={form.name} onChangeText={set('name')} autoComplete="name" />
            <Field label="Mobile number" value={form.phone} onChangeText={(v) => set('phone')(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" />
            <Field label="House number and street" value={form.line1} onChangeText={set('line1')} autoComplete="address-line1" />
            <Field label="Area (optional)" value={form.line2} onChangeText={set('line2')} />
            <Field label="Landmark (optional)" value={form.landmark} onChangeText={set('landmark')} />
            <Field label="City" value={form.city} onChangeText={set('city')} />
            <Field label="State" value={form.state} onChangeText={set('state')} />
            <Field label="Pincode" value={form.pincode} onChangeText={(v) => set('pincode')(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
            <ErrorText>{addressError}</ErrorText>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <Button label="Save address" onPress={saveAddress} busy={savingAddress} />
              {addresses.length ? <Button ghost label="Cancel" onPress={() => setAdding(false)} /> : null}
            </View>
          </View>
        ) : (
          <Button ghost label="Add a new address" onPress={() => setAdding(true)} />
        )}
      </Paper>

      <Paper>
        <Title size={24}>2  How will you pay?</Title>
        {([
          ['upi', 'UPI (GPay, PhonePe, Paytm, any bank app)', 'After you place the order we show the shop’s QR code and the exact amount.'],
          ['cod', 'Cash on delivery', 'Pay the courier when it arrives.'],
        ] as const).map(([key, label, hint]) => (
          <Pressable key={key} onPress={() => setMethod(key)} accessibilityRole="radio" accessibilityState={{ checked: method === key }}
            style={[s.choice, method === key && s.on]}>
            <View style={[s.radio, method === key && s.radioOn]} />
            <View style={{ flex: 1 }}>
              <Body bold>{label}</Body>
              <Body small>{hint}</Body>
            </View>
          </Pressable>
        ))}
      </Paper>

      <Paper>
        <Title size={24}>Your order</Title>
        {cart.cart?.items.map((i) => (
          <View key={i.id} style={s.line}>
            <Body small style={{ flex: 1 }}>{i.product_name} × {i.quantity}</Body>
            <Body small>{money(i.line_total)}</Body>
          </View>
        ))}
        {quote ? (
          <>
            <View style={s.line}><Body small>Items</Body><Body small>{money(quote.subtotal)}</Body></View>
            <View style={s.line}><Body small>Delivery</Body><Body small>{Number(quote.shipping_fee) ? money(quote.shipping_fee) : 'Free'}</Body></View>
            {Number(quote.cod_fee) ? <View style={s.line}><Body small>Cash on delivery fee</Body><Body small>{money(quote.cod_fee)}</Body></View> : null}
            <View style={s.line}><Text style={s.total}>To pay</Text><Text style={s.total}>{money(quote.total)}</Text></View>
          </>
        ) : null}
        {problems.map((p) => <ErrorText key={p}>{p}</ErrorText>)}
        <ErrorText>{error}</ErrorText>
        <Button
          label={method === 'upi' ? 'Place order and pay by UPI' : 'Place order'}
          onPress={place}
          busy={placing || quoting}
          disabled={!chosen || !quote || problems.length > 0}
          style={{ alignSelf: 'stretch' }}
        />
      </Paper>
    </Screen>
  );
}

const s = StyleSheet.create({
  choice: { flexDirection: 'row', gap: 12, padding: 14, borderWidth: 2, borderColor: color.paperStep, alignItems: 'flex-start' },
  on: { borderColor: color.ink },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.ink, marginTop: 2 },
  radioOn: { backgroundColor: color.ink },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  total: { fontFamily: font.bold, fontSize: 20, color: color.ink },
});
