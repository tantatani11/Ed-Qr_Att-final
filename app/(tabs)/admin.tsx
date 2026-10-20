import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  deleteAttendance,
  getAllAttendance,
  getAllUsers,
  getSystemReport,
  updateAttendanceStatus,
  updateUserRole,
  type AdminAttendanceRow,
  type AdminUserRow,
  type SystemReport,
} from '@/lib/attendance';
import { deleteEvent, effectiveStatus, getAllEvents, setEventStatus, type CloudEvent } from '@/lib/events';
import { formatDateTime, shortId } from '@/lib/format';
import { groupByAcademic } from '@/lib/grouping';
import { getProfile, type Role } from '@/lib/profiles';

type Tab = 'overview' | 'users' | 'events' | 'attendance';

type ListRow =
  | { kind: 'program'; key: string; label: string }
  | { kind: 'year'; key: string; label: string }
  | { kind: 'block'; key: string; label: string }
  | { kind: 'section'; key: string; label: string; icon: keyof typeof Ionicons.glyphMap }
  | { kind: 'user'; key: string; user: AdminUserRow }
  | { kind: 'event'; key: string; event: CloudEvent }
  | { kind: 'attendance'; key: string; row: AdminAttendanceRow };

export default function AdminScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [report, setReport] = useState<SystemReport | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [rows, setRows] = useState<AdminAttendanceRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const profile = await getProfile(user.id);
    const metaRole = ((user.user_metadata as any)?.role as Role | undefined) ?? 'student';
    const effective = (profile?.role ?? metaRole) as Role;
    setRole(effective);
    if (effective === 'admin') {
      const [r, u, e, a] = await Promise.all([
        getSystemReport(),
        getAllUsers(),
        getAllEvents(),
        getAllAttendance(),
      ]);
      setReport(r);
      setUsers(u);
      setEvents(e);
      setRows(a);
    }
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateText}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'admin') {
    return (
      <View style={styles.gate}>
        <Ionicons name="shield-outline" size={40} color={C.textSecondary} />
        <Text style={styles.gateTitle}>Administrators Only</Text>
        <Text style={styles.gateText}>
          Promote your account to admin in Supabase (profiles → role = admin) to access this panel.
        </Text>
      </View>
    );
  }

  const handleRole = async (id: string, next: 'student' | 'teacher' | 'admin') => {
    const { error } = await updateUserRole(id, next);
    setMsg(error ?? `User role set to ${next}.`);
    await load();
  };

  const handleAttStatus = async (id: string, status: 'present' | 'late' | 'excused' | 'absent') => {
    const { error } = await updateAttendanceStatus(id, status);
    setMsg(error ?? `Attendance marked ${status}.`);
    await load();
  };

  const handleAttDelete = async (id: string) => {
    const { error } = await deleteAttendance(id);
    setMsg(error ?? 'Attendance record deleted.');
    await load();
  };

  const handleEventStatus = async (ev: CloudEvent) => {
    const next = ev.status === 'closed' ? 'open' : 'closed';
    const { error } = await setEventStatus(ev.event_code, next);
    setMsg(error ?? `Event ${next}.`);
    await load();
  };

  const handleEventDelete = async (ev: CloudEvent) => {
    const { error } = await deleteEvent(ev.event_code);
    setMsg(error ?? 'Event deleted.');
    await load();
  };

  const students = users.filter((u) => u.role !== 'teacher' && u.role !== 'admin');
  const teachers = users.filter((u) => u.role === 'teacher');
  const adminUsers = users.filter((u) => u.role === 'admin');
  // Alphabetical within each bucket; buckets sorted Program → Year → Block.
  const sortedStudents = [...students].sort((a, b) =>
    (a.full_name || a.email).localeCompare(b.full_name || b.email)
  );
  const studentGroups = groupByAcademic(sortedStudents, (u) => ({
    program: u.program,
    year: u.year_level,
    block: u.block,
  }));

  // Build the flat list of rows for the active tab so we can virtualize
  // long lists (users / events / attendance) with a single FlatList.
  // Students are split Program → Year → Block (buckets come pre-sorted).
  const listData: ListRow[] = [];
  const blockText = (block: string) =>
    block === '–' ? 'No block' : `Block ${block}`;

  if (tab === 'users') {
    let lastProgram: string | null = null;
    let lastYear: string | null = null;
    studentGroups.forEach((g) => {
      if (g.program !== lastProgram) {
        listData.push({ kind: 'program', key: `p-${g.program}`, label: g.program });
        lastProgram = g.program;
        lastYear = null;
      }
      if (g.year !== lastYear) {
        listData.push({ kind: 'year', key: `y-${g.program}-${g.year}`, label: g.year });
        lastYear = g.year;
      }
      listData.push({
        kind: 'block',
        key: `b-${g.key}`,
        label: `${blockText(g.block)} (${g.members.length})`,
      });
      g.members.forEach((u) => listData.push({ kind: 'user', key: u.id, user: u }));
    });
    if (teachers.length > 0) {
      listData.push({
        kind: 'section',
        key: 's-teachers',
        label: `Teachers (${teachers.length})`,
        icon: 'school-outline',
      });
      teachers.forEach((u) => listData.push({ kind: 'user', key: u.id, user: u }));
    }
    if (adminUsers.length > 0) {
      listData.push({
        kind: 'section',
        key: 's-admins',
        label: `Admins (${adminUsers.length})`,
        icon: 'shield-outline',
      });
      adminUsers.forEach((u) => listData.push({ kind: 'user', key: u.id, user: u }));
    }
  } else if (tab === 'events') {
    events.forEach((ev) => listData.push({ kind: 'event', key: ev.event_code, event: ev }));
  } else if (tab === 'attendance') {
    const staff = rows.filter((r) => r.role === 'teacher' || r.role === 'admin');
    const studentRows = rows.filter(
      (r) => !(r.role === 'teacher' || r.role === 'admin')
    );
    const buckets = groupByAcademic(studentRows, (r) => ({
      program: r.program,
      year: r.yearLevel,
      block: r.block,
    }));
    let lastProgram: string | null = null;
    let lastYear: string | null = null;
    buckets.forEach((g) => {
      if (g.program !== lastProgram) {
        listData.push({ kind: 'program', key: `pa-${g.program}`, label: g.program });
        lastProgram = g.program;
        lastYear = null;
      }
      if (g.year !== lastYear) {
        listData.push({ kind: 'year', key: `ya-${g.program}-${g.year}`, label: g.year });
        lastYear = g.year;
      }
      listData.push({
        kind: 'block',
        key: `ba-${g.key}`,
        label: `${blockText(g.block)} (${g.members.length})`,
      });
      g.members.forEach((r) => listData.push({ kind: 'attendance', key: r.id, row: r }));
    });
    if (staff.length > 0) {
      listData.push({
        kind: 'section',
        key: 's-staff',
        label: `Teachers/Staff (${staff.length})`,
        icon: 'school-outline',
      });
      staff.forEach((r) => listData.push({ kind: 'attendance', key: r.id, row: r }));
    }
  }

  const emptyLabel =
    tab === 'users'
      ? 'No users found.'
      : tab === 'events'
        ? 'No events yet.'
        : tab === 'attendance'
          ? 'No attendance records yet.'
          : null;

  const renderUserCard = (u: AdminUserRow) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{u.full_name || u.email}</Text>
      <Text style={styles.cardSub}>{u.email} · {shortId(u.id)}</Text>
      {(u.program || u.year_level || u.block) && (
        <Text style={styles.cardSub}>
          {[u.program, u.year_level, u.block ? `Block ${u.block}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}
      <View style={styles.row}>
        {(['student', 'teacher', 'admin'] as const).map((r) => (
          <Pressable
            key={r}
            style={[styles.chip, u.role === r && styles.chipActive]}
            onPress={() => handleRole(u.id, r)}
          >
            <Text style={[styles.chipText, u.role === r && styles.chipTextActive]}>{r}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: ListRow }) => {
    if (item.kind === 'program') {
      return <Text style={styles.programHeader}>{item.label}</Text>;
    }
    if (item.kind === 'year') {
      return <Text style={styles.yearHeader}>{item.label}</Text>;
    }
    if (item.kind === 'block') {
      return (
        <View style={styles.blockHeader}>
          <Ionicons name="layers-outline" size={13} color={C.textSecondary} />
          <Text style={styles.blockHeaderText}>{item.label}</Text>
        </View>
      );
    }
    if (item.kind === 'section') {
      return (
        <View style={styles.groupHeader}>
          <Ionicons name={item.icon} size={16} color={C.primary} />
          <Text style={styles.groupHeaderText}>{item.label}</Text>
        </View>
      );
    }
    if (item.kind === 'user') {
      return renderUserCard(item.user);
    }
    if (item.kind === 'event') {
      const ev = item.event;
      const eff = effectiveStatus(ev);
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{ev.title}</Text>
          <Text style={styles.cardSub}>
            {ev.event_code} · {eff} · late after {ev.late_after_minutes ?? 15} min · {ev.start_time ? formatDateTime(ev.start_time) : 'no schedule'}
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.chip} onPress={() => handleEventStatus(ev)}>
              <Text style={styles.chipText}>{ev.status === 'closed' ? 'Reopen' : 'Close'}</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => handleEventDelete(ev)}>
              <Text style={[styles.chipText, { color: C.danger }]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    const r = item.row;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{r.studentName || shortId(r.studentId)}</Text>
        <Text style={styles.cardSub}>
          {r.eventTitle} ({r.eventCode}) · {r.status} · {formatDateTime(r.scannedAt)}
        </Text>
        <View style={styles.row}>
          {(['present', 'late', 'excused', 'absent'] as const).map((s) => (
            <Pressable key={s} style={[styles.chip, r.status === s && styles.chipActive]} onPress={() => handleAttStatus(r.id, s)}>
              <Text style={[styles.chipText, r.status === s && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.chip} onPress={() => handleAttDelete(r.id)}>
            <Text style={[styles.chipText, { color: C.danger }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={listData}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.subtitle}>Users · Events · Overall attendance · Reports</Text>

          <View style={styles.tabRow}>
            {(['overview', 'users', 'events', 'attendance'] as Tab[]).map((t) => (
              <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'overview' ? 'Reports' : t[0].toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {!!msg && <Text style={styles.msg}>{msg}</Text>}

          {tab === 'overview' && report && (
            <View style={styles.grid}>
              {[
                { label: 'Users', value: report.totalUsers, icon: 'people-outline' },
                { label: 'Events', value: report.totalEvents, icon: 'calendar-outline' },
                { label: 'Open', value: report.openEvents, icon: 'lock-open-outline' },
                { label: 'Closed', value: report.closedEvents, icon: 'lock-closed-outline' },
                { label: 'Attendance', value: report.totalAttendance, icon: 'checkmark-circle-outline' },
              ].map((s) => (
                <View key={s.label} style={styles.stat}>
                  <Ionicons name={s.icon as any} size={20} color={C.primary} />
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        emptyLabel ? <Text style={styles.empty}>{emptyLabel}</Text> : null
      }
    />
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: C.textPrimary },
  subtitle: { fontSize: 14, color: C.textSecondary, marginBottom: 14 },
  gate: { flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  gateTitle: { fontSize: 20, fontWeight: '700', color: C.textPrimary, marginTop: 12, marginBottom: 6 },
  gateText: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  tabRow: { flexDirection: 'row', marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.card, marginRight: 6, borderRadius: 10 },
  tabActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: C.textSecondary, textTransform: 'capitalize' },
  tabTextActive: { color: C.textOnPrimary },
  msg: { fontSize: 13, color: C.success, marginBottom: 10, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '31%', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: C.textPrimary, marginTop: 4 },
  statLabel: { fontSize: 12, color: C.textSecondary },
  card: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary },
  cardSub: { fontSize: 13, color: C.textSecondary, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: C.primary, textTransform: 'capitalize' },
  chipTextActive: { color: C.textOnPrimary },
  empty: { fontSize: 14, color: C.textSecondary },
  programHeader: { fontSize: 18, fontWeight: '800', color: C.primary, marginTop: 18, marginBottom: 4 },
  yearHeader: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginTop: 8, marginBottom: 2, marginLeft: 4 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6, marginLeft: 12 },
  blockHeaderText: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginLeft: 6 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary + '14', borderRadius: 10, borderWidth: 1, borderColor: C.primary + '40', paddingHorizontal: 12, paddingVertical: 10, marginTop: 14, marginBottom: 8 },
  groupHeaderText: { fontSize: 14, fontWeight: '800', color: C.primary, marginLeft: 8 },
});
