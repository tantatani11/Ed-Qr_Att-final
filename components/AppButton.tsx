import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: 'primary';
  onPress: () => void;
  disabled?: boolean;
};

export default function AppButton({
  title,
  icon,
  theme,
  onPress,
  disabled,
}: Props) {
  const C = useColors();
  const styles = makeStyles(C);
  const primary = theme === 'primary';

  return (
    <View style={[styles.buttonOuter, disabled && styles.buttonDisabled]}>
      <Pressable
        style={({ pressed }) => [
          styles.buttonInner,
          primary ? styles.primaryFill : styles.secondaryFill,
          pressed && !disabled && styles.buttonPressed,
        ]}
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
      >
        <Ionicons
          name={icon}
          size={22}
          color={primary ? C.textOnPrimary : C.textSecondary}
          style={styles.icon}
        />
        <Text style={[styles.label, primary && styles.labelPrimary]}>
          {title}
        </Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  buttonOuter: {
    width: '100%',
    marginBottom: 14,
  },
  buttonInner: {
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryFill: {
    backgroundColor: C.primary,
    borderWidth: 1,
    borderColor: C.primarySoft,
  },
  secondaryFill: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  icon: { paddingRight: 10 },
  label: { fontSize: 17, fontWeight: '600', color: C.textPrimary },
  labelPrimary: { color: C.textOnPrimary, fontWeight: '700' },
});