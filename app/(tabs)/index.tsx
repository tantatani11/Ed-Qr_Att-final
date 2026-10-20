import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import Header from '@/components/Header';
import type { Palette } from '@/constants/colors';
import { useColors, useTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';

type Action = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  onPress: () => void;
};

const STUDENT_ACTIONS: Action[] = [
  {
    title: 'Scan QR Code',
    subtitle: 'Record your attendance',
    icon: 'qr-code-outline',
    tint: '#22E05E',
    onPress: () => router.push('/scan'),
  },
  {
    title: 'Available Events',
    subtitle: 'Browse open events',
    icon: 'calendar-outline',
    tint: '#F59E0B',
    onPress: () => router.push('/events'),
  },
  {
    title: 'Attendance History',
    subtitle: 'Review past records',
    icon: 'time-outline',
    tint: '#1A73E8',
    onPress: () => router.push('/history'),
  },
  {
    title: 'Profile',
    subtitle: 'View your account',
    icon: 'person-outline',
    tint: '#9CC4FF',
    onPress: () => router.push('/profile'),
  },
];

const TEACHER_ACTIONS: Action[] = [
  {
    title: 'Manage Events',
    subtitle: 'Create events & generate QR',
    icon: 'clipboard-outline',
    tint: '#22E05E',
    onPress: () => router.push('/teacher'),
  },
  {
    title: 'Attendance History',
    subtitle: 'Who attended your events',
    icon: 'time-outline',
    tint: '#1A73E8',
    onPress: () => router.push('/history'),
  },
  {
    title: 'Profile',
    subtitle: 'View your account',
    icon: 'person-outline',
    tint: '#9CC4FF',
    onPress: () => router.push('/profile'),
  },
];

const ADMIN_ACTIONS: Action[] = [
  {
    title: 'Admin Panel',
    subtitle: 'Users, events & reports',
    icon: 'shield-outline',
    tint: '#F59E0B',
    onPress: () => router.push('/admin'),
  },
  {
    title: 'Manage Events',
    subtitle: 'Create events & generate QR',
    icon: 'clipboard-outline',
    tint: '#22E05E',
    onPress: () => router.push('/teacher'),
  },
  {
    title: 'Profile',
    subtitle: 'View your account',
    icon: 'person-outline',
    tint: '#9CC4FF',
    onPress: () => router.push('/profile'),
  },
];

export default function Index() {
  const C = useColors();
  const styles = makeStyles(C);
  const { mode, toggle } = useTheme();
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) {
        setRole(null);
        return () => {
          active = false;
        };
      }
      const metaRole = (user.user_metadata as any)?.role as Role | undefined;
      getProfile(user.id)
        .then((profile) => {
          if (active) setRole(profile?.role ?? metaRole ?? 'student');
        })
        .catch(() => {
          if (active) setRole(metaRole ?? 'student');
        });
      return () => {
        active = false;
      };
    }, [user])
  );

  const actions =
    role === 'admin' ? ADMIN_ACTIONS : role === 'teacher' ? TEACHER_ACTIONS : STUDENT_ACTIONS;
  const heroSubtitle =
    role === 'admin'
      ? 'Manage users, events and attendance records.'
      : role === 'teacher'
        ? 'Create events, share QR codes and monitor attendance.'
        : 'Scan QR Codes to record attendance during school activities.';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.themeBtn, pressed && styles.themeBtnPressed]}
            onPress={toggle}
            accessibilityLabel={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <Ionicons
              name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
              size={22}
              color={C.primary}
            />
          </Pressable>
        </View>
        <Header title="QR Attendance" />
        <Text style={styles.byLine}>by Tristan Dreco Garcia</Text>

        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="qr-code" size={30} color={C.primary} />
          </View>
          <Text style={styles.mainTitle}>School Event Attendance</Text>
          <Text style={styles.subtitle}>{heroSubtitle}</Text>
        </View>

        <Text style={styles.sectionLabel}>Quick Actions</Text>
        {actions.map((action) => (
          <Pressable
            key={action.title}
            style={({ pressed }) => [
              styles.actionCard,
              pressed && styles.actionCardPressed,
            ]}
            onPress={action.onPress}
          >
            <View style={[styles.actionIcon, { backgroundColor: action.tint + '1A' }]}>
              <Ionicons name={action.icon} size={22} color={action.tint} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  themeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeBtnPressed: {
    opacity: 0.7,
  },
  byLine: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: -12,
    marginBottom: 20,
  },
  heroCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary + '1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
  },
  actionCardPressed: {
    backgroundColor: C.surface,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textPrimary,
  },
  actionSubtitle: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 1,
  },
});