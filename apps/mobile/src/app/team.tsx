import * as Linking from 'expo-linking';

import { API_URL } from '@/lib/config';
import { useSession } from '@/lib/session';
import { Body, Button, Paper, Screen, Title } from '@/ui/kit';

/** This app is for shoppers; the shop team runs orders and products from the admin desk on the website. */
export default function Team() {
  const { user, signOut } = useSession();
  const desk = API_URL.replace(':8001', ':4200') + '/admin';
  return (
    <Screen>
      <Paper style={{ marginTop: 48, gap: 16 }}>
        <Title size={30}>Hello, team</Title>
        <Body>
          You’re logged in as {user?.email}. This app is for shoppers. Orders, products and payments are on the admin desk on
          the website.
        </Body>
        <Button label="Open the admin desk" onPress={() => void Linking.openURL(desk)} />
        <Button ghost label="Log out" onPress={() => void signOut()} />
      </Paper>
    </Screen>
  );
}
