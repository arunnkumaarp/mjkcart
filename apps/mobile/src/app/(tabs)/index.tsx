import type { Category, Product } from '@mjkcart/api';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { pick } from '@/lib/catalog';
import { money, percentOff } from '@/lib/format';
import { useShop } from '@/lib/shop';
import { Body, Button, Stamp, State, Title } from '@/ui/kit';
import { color, font, TOUCH } from '@/ui/theme';

type Sort = '' | 'low' | 'high';

/** The shop: shelves as chips, search and sort, two products across. */
export default function Shop() {
  const shop = useShop();
  const cart = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [shelves, setShelves] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [shelf, setShelf] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('');
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [p, c] = await Promise.all([
        api.GET('/api/v1/products/', { params: { query: { page_size: 100 } } }),
        api.GET('/api/v1/categories/'),
      ]);
      setProducts(p.data?.results ?? []);
      setShelves(c.data ?? []);
      setFailed(!p.data);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);

  const used = useMemo(() => shelves.filter((s) => products.some((p) => p.category === s.id)), [shelves, products]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = shelf ? products.filter((p) => p.category === shelf) : products;
    if (term) list = list.filter((p) => `${p.name} ${p.description ?? ''}`.toLowerCase().includes(term));
    const price = (p: Product) => Number(pick(p)?.price ?? p.price_from ?? 0);
    if (sort) list = [...list].sort((a, b) => (sort === 'low' ? price(a) - price(b) : price(b) - price(a)));
    return list;
  }, [products, shelf, q, sort]);

  async function add(p: Product) {
    const v = pick(p);
    if (!v) return;
    const error = await cart.add(v.id);
    setNotes((n) => ({ ...n, [p.id]: error || 'Added to your cart' }));
  }

  const header = (
    <View style={{ gap: 14, paddingBottom: 14 }}>
      <View style={{ paddingTop: 8 }}>
        <Title size={40}>{shop?.shop_name ?? 'MJK Cart'}</Title>
        {shop?.tagline ? <Body style={{ marginTop: 4 }}>{shop.tagline}</Body> : null}
      </View>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search the shop"
        placeholderTextColor="#8a8f94"
        accessibilityLabel="Search the shop"
        returnKeyType="search"
        style={s.search}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {used.length > 1 ? (
          [{ id: null as number | null, name: 'All' }, ...used].map((c) => (
            <Chip key={c.id ?? 'all'} label={c.name} on={shelf === c.id} onPress={() => setShelf(c.id)} />
          ))
        ) : null}
        <Chip label={sort === 'low' ? 'Price ↑' : sort === 'high' ? 'Price ↓' : 'Newest'} on={!!sort}
          onPress={() => setSort((x) => (x === '' ? 'low' : x === 'low' ? 'high' : ''))} />
      </ScrollView>
      {q.trim() ? <Body small>{shown.length} {shown.length === 1 ? 'product' : 'products'} for “{q.trim()}”</Body> : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top']}>
      <FlatList
        data={loading || failed ? [] : shown}
        keyExtractor={(p) => String(p.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={loading && products.length > 0} onRefresh={load} tintColor={color.ink} />}
        ListEmptyComponent={
          loading ? <State loading="Bringing the shelf out…" /> :
          failed ? <State error="We couldn’t load the products just now." onRetry={load} /> :
          q.trim() ? <State empty={`Nothing matches “${q.trim()}”. Try another word.`}><Button label="Show everything" onPress={() => setQ('')} /></State> :
          <State empty="Nothing on this shelf yet. New stock is on its way." />
        }
        renderItem={({ item: p }) => {
          const v = pick(p);
          const off = v ? percentOff(v.price, v.mrp) : 0;
          return (
            <View style={s.card}>
              <Pressable onPress={() => router.push(`/product/${p.slug}`)} accessibilityRole="link" accessibilityLabel={`See ${p.name}`}>
                <View style={s.picture}>
                  {p.images[0] ? <Image source={{ uri: p.images[0].image }} style={s.img} resizeMode="cover" /> :
                    <Text style={s.initial}>{p.name.charAt(0)}</Text>}
                  {off ? <View style={s.stampAt}><Stamp>{off}% off</Stamp></View> : null}
                </View>
                <Text style={s.name} numberOfLines={2}>{p.name}</Text>
              </Pressable>
              <View style={s.priceRow}>
                <Text style={s.price}>{money(v?.price ?? p.price_from)}</Text>
                {off ? <Text style={s.mrp}>{money(v?.mrp)}</Text> : null}
              </View>
              {v ? (
                <Button label={cart.working === v.id ? 'Adding…' : 'Add to cart'} busy={cart.working === v.id} onPress={() => void add(p)} style={{ alignSelf: 'stretch' }} />
              ) : (
                <Body muted small>Sold out for now</Body>
              )}
              {notes[p.id] ? <Body small>{notes[p.id]}</Body> : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[s.chip, on && { backgroundColor: color.ink }]}>
      <Text style={[s.chipText, on && { color: color.bg }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  search: { minHeight: TOUCH, borderWidth: 2, borderColor: color.ink, backgroundColor: color.paper, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 17, color: color.ink },
  chip: { minHeight: 40, paddingHorizontal: 14, borderWidth: 2, borderColor: color.ink, justifyContent: 'center' },
  chipText: { fontFamily: font.bold, fontSize: 14, color: color.ink },
  card: { flex: 1, backgroundColor: color.paper, padding: 10, gap: 8, maxWidth: '50%' },
  picture: { aspectRatio: 1, backgroundColor: color.paperStep, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  initial: { fontFamily: font.bold, fontSize: 56, color: color.bg },
  stampAt: { position: 'absolute', left: 6, top: 6 },
  name: { fontFamily: font.bold, fontSize: 16, lineHeight: 19, color: color.ink, marginTop: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontFamily: font.bold, fontSize: 18, color: color.ink },
  mrp: { fontFamily: font.regular, fontSize: 13, color: color.paperMuted, textDecorationLine: 'line-through' },
});
