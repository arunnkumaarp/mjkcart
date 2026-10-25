import type { Category, Product } from '@mjkcart/api';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { money, percentOff } from '@/lib/format';
import { Body, Button, ErrorText, Note, Paper, Screen, Stamp, State, Title } from '@/ui/kit';
import { color, font, TOUCH } from '@/ui/theme';

const FEW = 5;

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const cart = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [shelf, setShelf] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.GET('/api/v1/products/{slug}/', { params: { path: { slug } } });
      setProduct(data ?? null);
      setFailed(!data);
      if (data) {
        const first = data.variants.find((v) => v.is_active && (v.stock ?? 0) > 0) ?? data.variants.find((v) => v.is_active);
        setChosen(first?.id ?? null);
        const c = await api.GET('/api/v1/categories/');
        setShelf(c.data?.find((x) => x.id === data.category) ?? null);
      }
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, [slug]);
  useEffect(() => void load(), [load]);

  const options = useMemo(() => product?.variants.filter((v) => v.is_active) ?? [], [product]);
  const v = options.find((o) => o.id === chosen) ?? null;
  const left = v?.stock ?? 0;
  const inCart = cart.cart?.items.find((i) => i.variant === chosen)?.quantity ?? 0;

  async function add() {
    if (!v) return;
    setNote('');
    const e = await cart.add(v.id, quantity);
    if (e) return setError(e);
    setError('');
    setNote(`Added ${quantity} to your cart.`);
    setQuantity(1);
  }

  if (loading && !product) return <Screen header><State loading="Finding the product…" /></Screen>;
  if (failed || !product) {
    return (
      <Screen header>
        <Paper><State error="We couldn’t find that product. It may have sold out or been taken off the shelf." onRetry={load} /></Paper>
      </Screen>
    );
  }
  const off = v ? percentOff(v.price, v.mrp) : 0;

  return (
    <Screen header>
      {shelf ? <Body small>Shop / {shelf.name}</Body> : null}
      <View style={s.photo}>
        {product.images[photo] ? <Image source={{ uri: product.images[photo].image }} style={s.img} resizeMode="contain" /> :
          <Text style={s.initial}>{product.name.charAt(0)}</Text>}
        {off ? <View style={{ position: 'absolute', left: 10, top: 10 }}><Stamp>{off}% off</Stamp></View> : null}
      </View>
      {product.images.length > 1 ? (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {product.images.map((im, i) => (
            <Pressable key={im.id} onPress={() => setPhoto(i)} style={[s.thumb, photo === i && { borderColor: color.ink }]} accessibilityLabel={`Photo ${i + 1}`}>
              <Image source={{ uri: im.image }} style={s.img} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <Paper style={{ gap: 14 }}>
        <Title size={28}>{product.name}</Title>
        {v ? (
          <View style={s.priceRow}>
            <Text style={s.price}>{money(v.price)}</Text>
            {off ? (
              <>
                <Text style={s.mrp}>{money(v.mrp)}</Text>
                <Text style={s.save}>You save {money(Number(v.mrp) - Number(v.price))}</Text>
              </>
            ) : null}
          </View>
        ) : null}
        {options.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {options.map((o) => (
              <Pressable key={o.id} disabled={!o.stock} onPress={() => { setChosen(o.id); setQuantity(1); }}
                style={[s.option, chosen === o.id && { backgroundColor: color.ink }, !o.stock && { opacity: 0.4 }]}>
                <Text style={[s.optionText, chosen === o.id && { color: color.paper }]}>{o.label || money(o.price)}{!o.stock ? ' · sold out' : ''}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {v && left > 0 ? (
          <>
            {left <= FEW ? <Body bold style={{ color: color.danger }}>Only {left} left</Body> : null}
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={s.qty}>
                <Pressable accessibilityLabel="One less" onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={s.qtyBtn}>
                  <Text style={[s.qtyText, quantity <= 1 && { opacity: 0.3 }]}>−</Text>
                </Pressable>
                <Text style={s.qtyNum}>{quantity}</Text>
                <Pressable accessibilityLabel="One more" onPress={() => setQuantity((q) => Math.min(left, q + 1))} style={s.qtyBtn}>
                  <Text style={[s.qtyText, quantity >= left && { opacity: 0.3 }]}>+</Text>
                </Pressable>
              </View>
              <Button label="Add to cart" busy={cart.working === v.id} onPress={() => void add()} style={{ flex: 1, alignSelf: 'stretch' }} />
            </View>
            <Note>{note}</Note>
            {inCart ? <Button ghost label={`${inCart} in your cart · Go to cart`} onPress={() => router.navigate('/cart')} /> : null}
            <ErrorText>{error}</ErrorText>
          </>
        ) : (
          <Body bold muted>Sold out for now. Check back soon.</Body>
        )}
        {product.description ? (
          <View style={{ gap: 6, paddingTop: 8, borderTopWidth: 2, borderStyle: 'dotted', borderColor: color.paperStep }}>
            <Title size={20}>About it</Title>
            <Body>{product.description}</Body>
          </View>
        ) : null}
      </Paper>
    </Screen>
  );
}

const s = StyleSheet.create({
  photo: { aspectRatio: 4 / 3, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  initial: { fontFamily: font.bold, fontSize: 96, color: color.bg },
  thumb: { width: 64, height: 64, borderWidth: 2, borderColor: 'transparent', backgroundColor: color.paper },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  price: { fontFamily: font.bold, fontSize: 30, color: color.ink },
  mrp: { fontFamily: font.regular, fontSize: 16, color: color.paperMuted, textDecorationLine: 'line-through' },
  save: { fontFamily: font.bold, fontSize: 13, backgroundColor: color.bg, color: color.ink, paddingHorizontal: 8, paddingVertical: 2 },
  option: { minHeight: TOUCH, paddingHorizontal: 14, borderWidth: 2, borderColor: color.ink, justifyContent: 'center' },
  optionText: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  qty: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: color.ink },
  qtyBtn: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 24, color: color.ink },
  qtyNum: { minWidth: 28, textAlign: 'center', fontFamily: font.bold, fontSize: 17 },
});
