import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';

type Props = { title: string };

export default function Header({ title }: Props) {
  const C = useColors();
  const styles = makeStyles(C);
  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <MaterialIcons name="qr-code-scanner" size={36} color={C.logo} />
      </View>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: C.textPrimary,
  },
});
