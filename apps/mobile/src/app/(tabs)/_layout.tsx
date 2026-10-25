import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCart } from '@/lib/cart';
import { color, font } from '@/ui/theme';

type Icon = keyof typeof Ionicons.glyphMap;
const icon = (name: Icon) => ({ focused, size }: { focused: boolean; size: number }) => (
  <Ionicons name={name} color={focused ? color.bg : color.inkSoft} size={size} />
);

/** The four places a shopper goes, along the bottom within thumb reach — same as the website on a phone. */
export default function TabsLayout() {
  const { count } = useCart();
  // Sit above the phone's gesture bar or buttons, not under them.
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: color.ink, borderTopWidth: 0, height: 64 + bottom, paddingTop: 6, paddingBottom: bottom + 6 },
        tabBarActiveTintColor: color.bg,
        tabBarInactiveTintColor: color.inkSoft,
        tabBarLabelStyle: { fontFamily: font.bold, fontSize: 12 },
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Shop', tabBarIcon: icon('bag-handle-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: icon('cart-outline'),
          tabBarBadge: count || undefined,
          tabBarBadgeStyle: { backgroundColor: color.bg, color: color.ink, fontFamily: font.bold },
        }}
      />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
