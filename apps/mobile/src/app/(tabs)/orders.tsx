import type { Order } from '@mjkcart/api';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Body, Button, Paper, Screen, State, Title } from '@/ui/kit';
import { color, font } from '@/ui/theme';

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.GET('/api/v1/orders/');
      setOrders(data ?? []);
      setFailed(!data);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, []);
  // Reload each time the tab opens, so a just-placed or just-shipped order shows up.
  useFocusEffect(useCallback(() => void load(), [load]));

  return (
    <Screen>
      <Title>Your orders</Title>
      <Paper style={{ gap: 0 }}>
        {loading && !orders.length ? <State loading="Fetching your orders…" /> :
          failed ? <State error="We couldn’t load your orders." onRetry={load} /> :
          !orders.length ? (
            <State empty="No orders yet."><Button label="Go to the shop" onPress={() => router.navigate('/')} /></State>
          ) : orders.map((o) => (
            <Pressable key={o.number} onPress={() => router.push(`/order/${o.number}`)} style={s.row} accessibilityRole="link">
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.num}>{o.number}</Text>
                <Body small muted>
                  {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                  {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                </Body>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.status, o.status === 'payment_pending' && s.todo]}>
                  {o.status === 'payment_pending' && o.payment?.status !== 'submitted' ? 'Pay now' : o.status_label}
                </Text>
                <Text style={s.num}>{money(o.total)}</Text>
              </View>
            </Pressable>
          ))}
      </Paper>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, minHeight: 64, paddingVertical: 12, borderBottomWidth: 2, borderStyle: 'dotted', borderColor: color.paperStep },
  num: { fontFamily: font.bold, fontSize: 16, color: color.ink },
  status: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  todo: { backgroundColor: color.ink, color: color.bg, paddingHorizontal: 8, paddingVertical: 2 },
});
