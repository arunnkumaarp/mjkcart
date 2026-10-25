import type { Order } from '@mjkcart/api';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { firstMessage, money, OFFLINE } from '@/lib/format';
import { useShop } from '@/lib/shop';
import { Body, Button, ErrorText, Field, Note, Paper, Screen, Stamp, State, Title } from '@/ui/kit';
import { color, font } from '@/ui/theme';

const STEPS = [
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'packed', label: 'Packed' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
];

export default function OrderScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const shop = useShop();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [utr, setUtr] = useState('');
  const [sending, setSending] = useState(false);
  const [payError, setPayError] = useState('');
  const [payNote, setPayNote] = useState('');
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.GET('/api/v1/orders/{number}/', { params: { path: { number } } });
      setOrder(data ?? null);
      setFailed(!data);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, [number]);
  useEffect(() => void load(), [load]);

  if (loading && !order) return <Screen header><State loading="Finding your order…" /></Screen>;
  if (failed || !order) return <Screen header><Paper><State error="We couldn’t find that order." onRetry={load} /></Paper></Screen>;

  const o = order;
  const needsPayment = o.payment_method === 'upi' && o.status === 'payment_pending' && o.payment?.status !== 'submitted';
  const checking = o.status === 'payment_pending' && o.payment?.status === 'submitted';
  const step = STEPS.findIndex((x) => x.status === o.status);

  async function openUpiApp() {
    if (!shop?.upi_id) return;
    // UPI apps want the @ as is and spaces as %20.
    const part = (v: string) => encodeURIComponent(v).replace(/%40/g, '@');
    const params = { pa: shop.upi_id, pn: shop.shop_name ?? 'Shop', am: o.total, cu: 'INR', tn: o.number ?? '' };
    const url = 'upi://pay?' + Object.entries(params).map(([k, v]) => `${k}=${part(v)}`).join('&');
    try {
      await Linking.openURL(url);
    } catch {
      setPayError('No UPI app found on this phone. Scan the QR code from another phone, or pay to the UPI ID.');
    }
  }

  async function sendProof() {
    const reference = utr.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (reference.length < 6) return setPayError('Type the UPI reference number (UTR). It’s usually 12 digits.');
    setSending(true);
    setPayError('');
    try {
      const { data, error } = await api.POST('/api/v1/orders/{number}/payment/', {
        params: { path: { number: o.number ?? number } },
        body: {},
        bodySerializer: () => {
          const form = new FormData();
          form.append('reference', reference);
          return form;
        },
      });
      if (data) {
        setOrder(data);
        setUtr('');
        setPayNote('');
      } else setPayError(firstMessage(error) ?? 'We couldn’t send that. Please try again.');
    } catch {
      setPayError(OFFLINE);
    }
    setSending(false);
  }

  async function cancel() {
    setCancelling(true);
    setCancelError('');
    try {
      const { data, error } = await api.POST('/api/v1/orders/{number}/cancel/', {
        params: { path: { number: o.number ?? number } },
        body: { reason: reason.trim() },
      });
      if (data) {
        setOrder(data);
        setAsking(false);
      } else setCancelError(firstMessage(error) ?? 'We couldn’t cancel it. Please try again.');
    } catch {
      setCancelError(OFFLINE);
    }
    setCancelling(false);
  }

  async function copy(text: string) {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const cancelBlock = o.can_cancel ? (
    asking ? (
      <View style={s.box}>
        <Title size={20}>Cancel this order?</Title>
        <Field label="Why? (optional, it helps the shop)" value={reason} onChangeText={setReason} placeholder="Ordered by mistake" />
        <ErrorText>{cancelError}</ErrorText>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button danger label="Yes, cancel the order" onPress={cancel} busy={cancelling} />
          <Button ghost label="No, keep it" onPress={() => setAsking(false)} />
        </View>
      </View>
    ) : (
      <Button ghost label="Cancel this order" onPress={() => setAsking(true)} />
    )
  ) : null;

  return (
    <Screen header>
      <Stamp>{o.number}</Stamp>
      <Title>{needsPayment ? `Pay ${money(o.total)} to finish` : checking ? 'We’re checking your payment' : o.status_label}</Title>

      {needsPayment ? (
        <Paper style={{ gap: 14 }}>
          <Title size={24}>Scan and pay by UPI</Title>
          {o.payment?.status === 'rejected' ? (
            <View style={s.warn}>
              <Body>We couldn’t find your last payment{o.payment.reject_reason ? `: ${o.payment.reject_reason}` : ''}. Please check and send the reference again.</Body>
            </View>
          ) : null}
          {shop?.upi_qr ? <Image source={{ uri: shop.upi_qr }} style={s.qr} resizeMode="contain" accessibilityLabel="The shop's UPI QR code" /> : null}
          <View style={{ gap: 2 }}>
            <Body small muted>Amount</Body>
            <Text style={s.big}>{money(o.total)}</Text>
          </View>
          {shop?.upi_id ? <View style={{ gap: 2 }}><Body small muted>UPI ID</Body><Body bold>{shop.upi_id}</Body></View> : null}
          <View style={{ gap: 2 }}><Body small muted>Write in the note</Body><Body bold>{o.number}</Body></View>
          <Button label="Pay with a UPI app" onPress={() => void openUpiApp()} style={{ alignSelf: 'stretch' }} />
          <View style={s.divider} />
          <Title size={20}>After paying, tell us</Title>
          <Field label="UPI reference number (UTR)" value={utr} onChangeText={setUtr} keyboardType="number-pad" placeholder="12-digit number from your payment app" />
          <ErrorText>{payError}</ErrorText>
          <Note>{payNote}</Note>
          <Button label="I’ve paid" onPress={sendProof} busy={sending} />
          <Body small muted>A person checks every payment against the shop’s account, usually within a few hours.</Body>
          {cancelBlock}
        </Paper>
      ) : checking ? (
        <Paper>
          <Title size={22}>Payment received for checking</Title>
          <Body>We got your payment details{o.payment?.reference ? ` (reference ${o.payment.reference})` : ''}. A person is checking it against the shop’s account.</Body>
          <Button ghost label="Check again" onPress={load} />
          {cancelBlock}
        </Paper>
      ) : o.status !== 'cancelled' ? (
        <Paper>
          <Title size={22}>Where it is</Title>
          <View style={s.steps}>
            {STEPS.map((x, i) => (
              <View key={x.status} style={s.step}>
                <View style={[s.tick, i <= step && s.tickOn]}><Text style={s.tickText}>{i <= step ? '✓' : ''}</Text></View>
                <Text style={[s.stepText, i > step && { color: color.paperMuted }]}>{x.label}</Text>
              </View>
            ))}
          </View>
          {o.tracking_number ? (
            <View style={s.box}>
              <Body>Sent with <Body bold>{o.courier_name}</Body></Body>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Body>Tracking number <Body bold>{o.tracking_number}</Body></Body>
                <Button ghost label={copied ? 'Copied' : 'Copy'} onPress={() => void copy(o.tracking_number!)} />
              </View>
              {o.tracking_url ? <Button label="Track your parcel" onPress={() => void Linking.openURL(o.tracking_url!)} /> :
                <Body small muted>Track it on the {o.courier_name} website or app with this number.</Body>}
            </View>
          ) : null}
          {o.payment_method === 'cod' && o.status !== 'delivered' && o.status !== 'returned' ? <Body small muted>Pay {money(o.total)} in cash when the parcel arrives.</Body> : null}
          {o.status === 'packed' ? <Body small muted>Your order is packed. Want to change it? Please contact the shop.</Body> : null}
          {cancelBlock}
        </Paper>
      ) : (
        <Paper>
          <Title size={22}>This order is cancelled</Title>
          <Body>Nothing will be sent.</Body>
          <Button label="Back to the shop" onPress={() => router.navigate('/')} />
        </Paper>
      )}

      <Paper>
        <Title size={22}>What’s in it</Title>
        {o.items.map((i) => (
          <View key={i.id} style={s.line}>
            <Body small style={{ flex: 1 }}>{i.product_name}{i.label ? ` (${i.label})` : ''} × {i.quantity}</Body>
            <Body small>{money(i.line_total)}</Body>
          </View>
        ))}
        <View style={s.line}><Body small>Delivery</Body><Body small>{Number(o.shipping_fee) ? money(o.shipping_fee) : 'Free'}</Body></View>
        <View style={s.line}><Text style={s.total}>Total</Text><Text style={s.total}>{money(o.total)}</Text></View>
        <Body small muted>To {o.ship_name}, {o.ship_line1}, {o.ship_city} {o.ship_pincode}</Body>
      </Paper>
    </Screen>
  );
}

const s = StyleSheet.create({
  warn: { borderLeftWidth: 6, borderColor: color.danger, backgroundColor: color.paperStep, padding: 12 },
  qr: { width: 220, height: 260, alignSelf: 'center' },
  big: { fontFamily: font.bold, fontSize: 36, color: color.ink },
  divider: { borderTopWidth: 2, borderStyle: 'dotted', borderColor: color.paperStep },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  step: { width: '45%', gap: 6 },
  tick: { width: 32, height: 32, borderWidth: 2, borderColor: color.paperMuted, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: color.ink, borderColor: color.ink },
  tickText: { color: color.bg, fontSize: 18 },
  stepText: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  box: { gap: 8, padding: 14, borderWidth: 2, borderColor: color.ink },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  total: { fontFamily: font.bold, fontSize: 20, color: color.ink },
});
