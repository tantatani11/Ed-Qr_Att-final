import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import ErrorBoundary from '@/components/ErrorBoundary';
import type { Palette } from '@/constants/colors';
import { initAuth, useAuth } from '@/lib/auth';
import { ThemeProvider, useColors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function AppShell() {
  const C = useColors();
  const styles = makeStyles(C);
  const { session, loading } = useAuth();
  const segments = useSegments();

  // EVENT: app mounts → HANDLER: initAuth → ACTION: restore Supabase session → RESULT: persistent login
  useEffect(() => {
    initAuth();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const path = segments?.[0];
  const inAuthGroup = path === 'login' || path === 'register';

  // Not logged in and not on a public screen (login/register) → send to login.
  // This also covers the very first render, when the path is still empty.
  if (!session && !inAuthGroup) {
    return <Redirect href="/login" />;
  }
  // Logged in and currently on the login/register screen → send to tabs.
  if (session && inAuthGroup) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    paddingHorizontal: 32,
  },
});
