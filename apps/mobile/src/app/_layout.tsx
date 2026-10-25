import {
  BricolageGrotesque_400Regular, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { CartProvider } from '@/lib/cart';
import { isStaff, SessionProvider, useSession } from '@/lib/session';
import { color, font } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

export default function Root() {
  const [fontsLoaded] = useFonts({ BricolageGrotesque_400Regular, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold });
  return (
    <SessionProvider>
      <CartProvider>
        <StatusBar style="dark" />
        {fontsLoaded ? <Screens /> : null}
      </CartProvider>
    </SessionProvider>
  );
}

/** Logged out: only login and signup. Buyers: the shop. The shop team: a note pointing to the admin desk. */
function Screens() {
  const { ready, user } = useSession();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  const buyer = !!user && !isStaff(user);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: color.bg },
        headerTintColor: color.ink,
        headerTitleStyle: { fontFamily: font.bold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ title: 'Create account' }} />
      </Stack.Protected>
      <Stack.Protected guard={buyer}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[slug]" options={{ title: '' }} />
        <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
        <Stack.Screen name="order/[number]" options={{ title: 'Order' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user && isStaff(user)}>
        <Stack.Screen name="team" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
