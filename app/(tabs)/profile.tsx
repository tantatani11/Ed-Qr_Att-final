import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AppButton from '@/components/AppButton';
import type { Palette } from '@/constants/colors';
import { useColors, useTheme } from '@/lib/theme';
import { useAuth, signOut } from '@/lib/auth';
import { maskUserId } from '@/lib/format';
import { BLOCKS, PROGRAMS, YEAR_LEVELS, getProfile, syncProfileFromMetadata, updateProfile, type Profile } from '@/lib/profiles';

export default function ProfileScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const { mode, setMode } = useTheme();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftYear, setDraftYear] = useState('');
  const [draftProgram, setDraftProgram] = useState('');
  const [draftBlock, setDraftBlock] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    // Ipakita dayon ang name gikan sa metadata samtang nag-sync sa DB,
    // para dili blank bisag wala pa na-save ang profiles row.
    const metaName =
      ((user.user_metadata ?? {}) as any)?.full_name?.trim?.() || '';
    const p = await syncProfileFromMetadata(user);
    const finalProfile = p ?? (await getProfile(user.id));
    setProfile(finalProfile);
    setDraftName(finalProfile?.full_name?.trim?.() || metaName);
    setDraftYear(finalProfile?.year_level ?? '');
    setDraftProgram(finalProfile?.program ?? '');
    setDraftBlock(finalProfile?.block ?? '');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user) return;
    if (!draftName.trim()) {
      Alert.alert('Validation', 'Name cannot be empty.');
      return;
    }
    if (isStudent && !draftYear) {
      Alert.alert('Validation', 'Please select your year level.');
      return;
    }
    if (isStudent && !draftProgram.trim()) {
      Alert.alert('Validation', 'Program cannot be empty.');
      return;
    }
    if (isStudent && !draftBlock) {
      Alert.alert('Validation', 'Please select your block.');
      return;
    }
    setSaving(true);
    const { error } = await updateProfile(user.id, {
      full_name: draftName.trim(),
      ...(isStudent
        ? {
            year_level: draftYear,
            program: draftProgram.trim().toUpperCase(),
            block: draftBlock,
          }
        : {}),
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              full_name: draftName.trim(),
              ...(isStudent
                ? {
                    year_level: draftYear,
                    program: draftProgram.trim().toUpperCase(),
                    block: draftBlock,
                  }
                : {}),
            }
          : prev
      );
      setEditing(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      // The root guard in app/_layout.tsx redirects to /login once the
      // session clears; navigating here too caused a double transition.
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  const metaName =
    ((user?.user_metadata ?? {}) as any)?.full_name?.trim?.() || '';
  const metaRole = ((user?.user_metadata ?? {}) as any)?.role;
  // Parehas sa Teacher tab: teacher kung teacher bisan asa (DB o metadata).
  const isTeacher = profile?.role === 'teacher' || metaRole === 'teacher';
  const isAdmin = profile?.role === 'admin' || metaRole === 'admin';
  const isStudent = !isTeacher && !isAdmin;
  const roleLabel = isAdmin ? 'Admin' : isTeacher ? 'Teacher' : 'Student';
  const displayName = profile?.full_name?.trim?.() || metaName;
  // Academic info: DB first, register metadata as fallback (para makita
  // gihapon sa tag-iya bisag wala pa na-sync ang profiles row).
  const metaAcademic = ((user?.user_metadata ?? {}) as any) ?? {};
  const displayYear = profile?.year_level || metaAcademic.year_level || '';
  const displayProgram = profile?.program || metaAcademic.program || '';
  const displayBlock = profile?.block || metaAcademic.block || '';
  const hasAcademic = !!(displayYear || displayProgram || displayBlock);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>My Profile</Text>
          <Text style={styles.subtitle}>
            Manage your account details and sign out.
          </Text>
        </View>
        <View style={[styles.roleBadge, !isTeacher && !isAdmin && styles.roleBadgeStudent]}>
          <Text style={styles.roleBadgeText}>
            {roleLabel}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Personal Information</Text>

        <Text style={styles.label}>Name</Text>
        {editing ? (
          <View style={styles.nameEditRow}>
            <View style={styles.inputWrap}>
              <Ionicons
                name="person-outline"
                size={18}
                color={C.textSecondary}
              />
              <TextInput
                style={styles.input}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="e.g. Maria Santos"
                placeholderTextColor={C.textSecondary}
                autoCapitalize="words"
              />
            </View>
            <Pressable
              style={styles.saveBtn}
              onPress={handleSaveName}
              disabled={saving}
            >
              <Text style={styles.saveText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.pickerField,
              pressed && styles.pickerFieldPressed,
            ]}
            onPress={() => setEditing(true)}
          >
            <Ionicons name="person-outline" size={20} color={C.primary} />
            <Text style={styles.pickerValue}>
              {displayName || 'Tap to add your name'}
            </Text>
            <View style={styles.editChip}>
              <Text style={styles.editHint}>Edit</Text>
            </View>
          </Pressable>
        )}

        <Text style={styles.label}>Email</Text>
        <View style={styles.readField}>
          <Ionicons name="mail-outline" size={20} color={C.primary} />
          <Text style={styles.readValue}>
            {user?.email ?? profile?.email ?? '—'}
          </Text>
        </View>

        {isStudent && (
          <>
            <Text style={styles.label}>Year Level</Text>
            {editing ? (
              <View style={styles.chipGrid}>
                {YEAR_LEVELS.map((y) => (
                  <Pressable
                    key={y}
                    style={[styles.miniChip, draftYear === y && styles.miniChipActive]}
                    onPress={() => setDraftYear(y)}
                  >
                    <Text
                      style={[styles.miniChipText, draftYear === y && styles.miniChipTextActive]}
                    >
                      {y}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.readField}>
                <Ionicons name="school-outline" size={20} color={C.primary} />
                <Text style={styles.readValue}>
                  {displayYear || '—'}
                </Text>
              </View>
            )}

            <Text style={styles.label}>Program</Text>
            {editing ? (
              <View style={styles.chipGrid}>
                {PROGRAMS.map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.miniChip, draftProgram === p && styles.miniChipActive]}
                    onPress={() => setDraftProgram(p)}
                  >
                    <Text
                      style={[styles.miniChipText, draftProgram === p && styles.miniChipTextActive]}
                    >
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.readField}>
                <Ionicons name="book-outline" size={20} color={C.primary} />
                <Text style={styles.readValue}>
                  {displayProgram || '—'}
                </Text>
              </View>
            )}

            <Text style={styles.label}>Block</Text>
            {editing ? (
              <View style={styles.chipGrid}>
                {BLOCKS.map((b) => (
                  <Pressable
                    key={b}
                    style={[styles.miniChip, draftBlock === b && styles.miniChipActive]}
                    onPress={() => setDraftBlock(b)}
                  >
                    <Text
                      style={[styles.miniChipText, draftBlock === b && styles.miniChipTextActive]}
                    >
                      {b}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.readField}>
                <Ionicons name="people-outline" size={20} color={C.primary} />
                <Text style={styles.readValue}>
                  {displayBlock ? `Block ${displayBlock}` : '—'}
                </Text>
              </View>
            )}
            {!editing && !hasAcademic && (
              <Text style={styles.hint}>
                Wala pa kay Year/Program/Block — pindota ang Edit sa Name ayha pilia.
              </Text>
            )}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Account</Text>

        <Text style={styles.label}>Role</Text>
        <View style={styles.readField}>
          <Ionicons
            name={isAdmin ? 'shield-outline' : isTeacher ? 'school-outline' : 'person-circle-outline'}
            size={20}
            color={C.primary}
          />
          <Text style={styles.readValue}>
            {roleLabel}
          </Text>
        </View>

        <Text style={styles.label}>User ID</Text>
        <View style={styles.readField}>
          <Ionicons name="key-outline" size={20} color={C.primary} />
          <Text style={[styles.readValue, styles.monoText]}>
            {maskUserId(user?.id)}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.themeRow}>
          <Pressable
            style={[styles.themeChip, mode === 'light' && styles.themeChipActive]}
            onPress={() => setMode('light')}
          >
            <Ionicons
              name="sunny-outline"
              size={18}
              color={mode === 'light' ? C.primary : C.textSecondary}
            />
            <Text
              style={[styles.themeChipText, mode === 'light' && styles.themeChipTextActive]}
            >
              Light
            </Text>
          </Pressable>
          <Pressable
            style={[styles.themeChip, mode === 'dark' && styles.themeChipActive]}
            onPress={() => setMode('dark')}
          >
            <Ionicons
              name="moon-outline"
              size={18}
              color={mode === 'dark' ? C.primary : C.textSecondary}
            />
            <Text
              style={[styles.themeChipText, mode === 'dark' && styles.themeChipTextActive]}
            >
              Dark
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.hint}>
        Tap Edit to update the name shown on attendance records.
      </Text>

      <AppButton
        title="Sign Out"
        icon="log-out-outline"
        onPress={handleSignOut}
        disabled={loading}
      />
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: C.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: C.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginLeft: 8,
  },
  roleBadgeStudent: {
    backgroundColor: C.textSecondary,
  },
  roleBadgeText: {
    color: C.textOnPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 6,
    marginTop: 12,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 8,
    fontSize: 16,
    color: C.textPrimary,
  },
  pickerField: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerFieldPressed: {
    opacity: 0.85,
  },
  pickerValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: C.textPrimary,
    marginHorizontal: 10,
  },
  readField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  readValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: C.textPrimary,
    marginLeft: 10,
  },
  monoText: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  editChip: {
    backgroundColor: C.primary + '14',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  editHint: {
    fontSize: 13,
    fontWeight: '600',
    color: C.primary,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 8,
  },
  saveText: {
    color: C.textOnPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 2,
    marginBottom: 16,
  },
  themeRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  themeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    marginRight: 8,
  },
  themeChipActive: {
    backgroundColor: C.primary + '14',
    borderColor: C.primary,
  },
  themeChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSecondary,
    marginLeft: 8,
  },
  themeChipTextActive: {
    color: C.primary,
    fontWeight: '700',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  miniChip: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  miniChipActive: {
    backgroundColor: C.primary + '14',
    borderColor: C.primary,
  },
  miniChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textSecondary,
  },
  miniChipTextActive: {
    color: C.primary,
    fontWeight: '700',
  },
});