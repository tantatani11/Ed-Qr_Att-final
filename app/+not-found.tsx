import { View, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';

import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';

export default function NotFoundScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  return (
    <>
      <Stack.Screen options={{ title: 'Oops! Not Found' }} />
      <View style={styles.container}>
        <Link href="/" style={styles.button}>
          Go back to Home screen!
        </Link>
      </View>
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center' },
  button: { fontSize: 20, textDecorationLine: 'underline', color: C.textPrimary },
});
