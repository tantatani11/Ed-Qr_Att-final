import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Pressable,
} from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';
import { signUp } from '@/lib/auth';
import { BLOCKS, PROGRAMS, YEAR_LEVELS } from '@/lib/profiles';

export default function RegisterScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [yearLevel, setYearLevel] = useState('');
  const [program, setProgram] = useState('');
  const [block, setBlock] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    if (role === 'student') {
      if (!yearLevel) {
        setError('Please select your year level.');
        return;
      }
      if (!program.trim()) {
        setError('Program is required (e.g. BSIT).');
        return;
      }
      if (!block) {
        setError('Please select your block (A–F).');
        return;
      }
    }

    if (!email.trim() || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await signUp(
        email.trim().toLowerCase(),
        password,
        {
          full_name: fullName.trim(),
          role,
          ...(role === 'student'
            ? {
                year_level: yearLevel,
                program: program.trim().toUpperCase(),
                block,
              }
            : {}),
        }
      );

      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('already exists')) {
          setError(
            'This email is already registered. Please Sign In instead, or reset your password if you forgot it.'
          );
        } else {
          setError(authError.message);
        }
      } else if (!data.session) {
        // Email confirmation is on — show the "check your email" message.
        // When a session exists, the root guard in app/_layout.tsx navigates
        // to /(tabs); navigating here too caused a double transition.
        setSuccess(true);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
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

            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Register to start recording attendance</Text>

            {success ? (
              <View style={styles.successContainer}>
                <Text style={styles.successTitle}>Check your email!</Text>
                <Text style={styles.successText}>
                  We sent a confirmation link to {email}. Click the link to verify your
                  account, then come back and sign in.
                </Text>
                <Link href="/login" style={styles.link}>
                  Back to Sign In
                </Link>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="e.g. Maria Santos"
                  placeholderTextColor={C.textSecondary}
                  editable={!loading}
                />

                <Text style={styles.label}>I am a...</Text>
                <View style={styles.roleRow}>
                  <Pressable
                    style={[styles.roleChip, role === 'student' && styles.roleChipActive]}
                    onPress={() => setRole('student')}
                  >
                    <Text
                      style={[styles.roleChipText, role === 'student' && styles.roleChipTextActive]}
                    >
                      Student
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.roleChip, role === 'teacher' && styles.roleChipActive]}
                    onPress={() => setRole('teacher')}
                  >
                    <Text
                      style={[styles.roleChipText, role === 'teacher' && styles.roleChipTextActive]}
                    >
                      Teacher
                    </Text>
                  </Pressable>
                </View>

                {role === 'student' && (
                  <>
                    <Text style={styles.label}>Year Level</Text>
                    <View style={styles.chipGrid}>
                      {YEAR_LEVELS.map((y) => (
                        <Pressable
                          key={y}
                          style={[styles.miniChip, yearLevel === y && styles.roleChipActive]}
                          onPress={() => setYearLevel(y)}
                        >
                          <Text
                            style={[styles.roleChipText, yearLevel === y && styles.roleChipTextActive]}
                          >
                            {y}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.label}>Program</Text>
                    <View style={styles.chipGrid}>
                      {PROGRAMS.map((p) => (
                        <Pressable
                          key={p}
                          style={[styles.miniChip, program === p && styles.roleChipActive]}
                          onPress={() => setProgram(p)}
                        >
                          <Text
                            style={[styles.roleChipText, program === p && styles.roleChipTextActive]}
                          >
                            {p}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.label}>Block</Text>
                    <View style={styles.chipGrid}>
                      {BLOCKS.map((b) => (
                        <Pressable
                          key={b}
                          style={[styles.miniChip, block === b && styles.roleChipActive]}
                          onPress={() => setBlock(b)}
                        >
                          <Text
                            style={[styles.roleChipText, block === b && styles.roleChipTextActive]}
                          >
                            {b}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

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
                  placeholder="At least 6 characters"
                  placeholderTextColor={C.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
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
                    title="Sign Up"
                    icon="person-add-outline"
                    onPress={handleRegister}
                  />
                )}
              </View>
            )}

            {!success && (
              <Link href="/login" style={styles.link}>
                Already have an account? Sign In
              </Link>
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
  roleRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  roleChip: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: C.primary + '14',
    borderColor: C.primary,
  },
  roleChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSecondary,
  },
  roleChipTextActive: {
    color: C.primary,
    fontWeight: '700',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  miniChip: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  error: {
    fontSize: 14,
    color: C.danger,
    marginTop: 12,
    marginBottom: 4,
  },
  loader: {
    marginVertical: 16,
  },
  link: {
    fontSize: 14,
    color: C.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  successContainer: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: C.card,
    borderRadius: 10,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
});