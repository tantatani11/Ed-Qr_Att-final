import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';
import { resetPassword, signIn } from '@/lib/auth';

export default function LoginScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      const { error: authError } = await signIn(email.trim(), password);

      // Navigation on success is handled once by the root guard in
      // app/_layout.tsx (session set → redirect to /(tabs)). Doing it here
      // too caused a double transition that crashes Fabric on Android.
      if (authError) {
        setError(authError.message);
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await resetPassword(email);
      if (resetError) {
        setError(resetError.message);
      } else {
        setResetSent(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const backToSignIn = () => {
    setMode('signin');
    setError(null);
    setResetSent(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <Header title="QR Attendance" />
            </View>

            <Text style={styles.title}>
              {mode === 'forgot' ? 'Reset Password' : 'Welcome Back'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'forgot'
                ? 'Enter your email and we will send a reset link.'
                : 'Sign in to record your attendance'}
            </Text>

            <View style={styles.form}>
              {mode === 'forgot' ? (
                resetSent ? (
                  <Text style={styles.info}>
                    If an account exists for {email.trim()}, a password reset link is on
                    its way. Check your inbox (and spam folder).
                  </Text>
                ) : (
                  <>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="your.email@school.edu"
                      placeholderTextColor={C.textSecondary}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!loading}
                    />

                    {error && <Text style={styles.error}>{error}</Text>}

                    {loading ? (
                      <ActivityIndicator size="large" color={C.primary} style={styles.loader} />
                    ) : (
                      <AppButton
                        theme="primary"
                        title="Send Reset Link"
                        icon="mail-outline"
                        onPress={handleReset}
                      />
                    )}
                  </>
                )
              ) : (
                <>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your.email@school.edu"
                    placeholderTextColor={C.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!loading}
                  />

                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor={C.textSecondary}
                    secureTextEntry
                    editable={!loading}
                  />

                  {error && <Text style={styles.error}>{error}</Text>}

                  {loading ? (
                    <ActivityIndicator size="large" color={C.primary} style={styles.loader} />
                  ) : (
                    <AppButton
                      theme="primary"
                      title="Sign In"
                      icon="log-in-outline"
                      onPress={handleLogin}
                    />
                  )}
                </>
              )}
            </View>

            {mode === 'forgot' ? (
              <Pressable onPress={backToSignIn}>
                <Text style={styles.link}>Back to Sign In</Text>
              </Pressable>
            ) : (
              <>
                <Pressable onPress={() => { setMode('forgot'); setError(null); }}>
                  <Text style={styles.link}>Forgot password?</Text>
                </Pressable>
                <Link href="/register" style={[styles.link, styles.registerLink]}>
                  Don't have an account? Sign Up
                </Link>
              </>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: C.textSecondary,
    lineHeight: 21,
    marginBottom: 32,
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: C.textPrimary,
  },
  error: {
    fontSize: 14,
    color: C.danger,
    marginTop: 12,
    marginBottom: 4,
  },
  info: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  loader: {
    marginVertical: 16,
  },
  link: {
    fontSize: 14,
    color: C.primary,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 16,
  },
  registerLink: {
    marginTop: 20,
  },
});