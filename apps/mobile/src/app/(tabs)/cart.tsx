import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCart } from '@/lib/cart';
import { money } from '@/lib/format';
import { Body, Button, ErrorText, Paper, Screen, State, Title } from '@/ui/kit';
import { color, font, TOUCH } from '@/ui/theme';

export default function CartScreen() {
  const cart = useCart();
  const [error, setError] = useState('');
  const items = cart.cart?.items ?? [];

  async function run(call: Promise<string>) {
    setError(await call);
  }

  return (
    <Screen>
      <Title>Your cart</Title>
      <Paper>
        {cart.loading && !cart.cart ? <State loading="Opening your cart…" /> :
          !items.length ? (
            <State empty="Your cart is empty.">
              <Button label="Go to the shop" onPress={() => router.navigate('/')} />
            </State>
          ) : (
            <>
              {items.map((item) => (
                <View key={item.id} style={s.line}>
                  <View style={s.thumb}>{item.image ? <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} /> : null}</View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.name}>{item.product_name}{item.label ? ` (${item.label})` : ''}</Text>
                    <Body small muted>{money(item.price)} each</Body>
                    {!item.available ? <Body small style={{ color: color.danger }}>No longer available. Please take it out.</Body> : null}
                    <View style={s.qtyRow}>
                      <View style={s.qty}>
                        <Pressable accessibilityLabel={`One less ${item.product_name}`} style={s.qtyBtn} disabled={cart.working === item.id}
                          onPress={() => void run(item.quantity > 1 ? cart.setQuantity(item.id, item.quantity - 1) : cart.remove(item.id))}>
                          <Text style={s.qtyText}>−</Text>
                        </Pressable>
                        <Text style={s.qtyNum}>{item.quantity}</Text>
                        <Pressable accessibilityLabel={`One more ${item.product_name}`} style={s.qtyBtn}
                          disabled={cart.working === item.id || item.quantity >= item.stock}
                          onPress={() => void run(cart.setQuantity(item.id, item.quantity + 1))}>
                          <Text style={[s.qtyText, item.quantity >= item.stock && { opacity: 0.3 }]}>+</Text>
                        </Pressable>
                      </View>
                      <Text style={s.total}>{money(item.line_total)}</Text>
                    </View>
                    <Button ghost label="Remove" onPress={() => void run(cart.remove(item.id))} />
                  </View>
                </View>
              ))}
              <ErrorText>{error}</ErrorText>
              <View style={s.summary}>
                <Body bold>Subtotal ({cart.count} {cart.count === 1 ? 'item' : 'items'})</Body>
                <Text style={s.sub}>{money(cart.cart?.subtotal)}</Text>
              </View>
              <Body small muted>Delivery and payment (UPI or cash on delivery) are chosen at checkout.</Body>
              <Button label="Checkout" onPress={() => router.push('/checkout')} style={{ alignSelf: 'stretch' }} />
            </>
          )}
      </Paper>
    </Screen>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 2, borderStyle: 'dotted', borderColor: color.paperStep },
  thumb: { width: 72, height: 72, backgroundColor: color.paperStep, overflow: 'hidden' },
  name: { fontFamily: font.bold, fontSize: 16, color: color.ink },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  qty: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: color.ink },
  qtyBtn: { width: TOUCH, height: TOUCH - 4, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 22, color: color.ink },
  qtyNum: { minWidth: 28, textAlign: 'center', fontFamily: font.bold, fontSize: 16 },
  total: { fontFamily: font.bold, fontSize: 16, color: color.ink },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8 },
  sub: { fontFamily: font.bold, fontSize: 22, color: color.ink },
});
