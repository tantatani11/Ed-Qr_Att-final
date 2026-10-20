import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';
import {
  getAttendanceHistory,
  getTeacherEventAttendance,
  type AttendanceRecord,
  type TeacherEventAttendance,
} from '@/lib/attendance';
import { useAuth } from '@/lib/auth';
import { formatDateTime, shortId } from '@/lib/format';
import { bucketLabel, groupByAcademic } from '@/lib/grouping';
import { getProfile, type Role } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

export default function HistoryScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const profile = await getProfile(user.id);
    // Same fallback as the Teacher tab: a teacher stuck as 'student' in the
    // DB (old trigger bug) must still see the teacher view, since they can
    // create events. Metadata is checked second, DB first.
    const metaRole = (user.user_metadata as any)?.role as Role | undefined;
    const dbRole = profile?.role;
    const currentRole: Role =
      dbRole === 'teacher' || metaRole === 'teacher'
        ? 'teacher'
        : (dbRole ?? metaRole ?? 'student');
    setRole(currentRole);

    if (currentRole === 'teacher') {
      const events = await getTeacherEventAttendance(user.id);
      setTeacherEvents(events);
      setStudentRecords([]);
    } else {
      const records = await getAttendanceHistory(user.id);
      setStudentRecords(records);
      setTeacherEvents([]);
    }

    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // EVENT: new scan lands in DB → HANDLER: realtime subscription →
  // ACTION: reload list → RESULT: teacher sees attendees appear live.
  // (Requires the supabase_realtime publication in schema.sql; if it is
  // missing, nothing breaks — focus-refresh above still reloads the list.)
  useEffect(() => {
    if (!user || role !== 'teacher') return;
    const channel = supabase
      .channel('teacher-attendance-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, load]);

  if (role === 'teacher') {
    return (
      <FlatList
        style={styles.container}
        data={teacherEvents}
        keyExtractor={(event) => event.eventId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Attendance History</Text>
            <Text style={styles.subHeader}>Your events and who attended them</Text>
            {loading && <Text style={styles.emptyText}>Loading records...</Text>}
            {!loading && teacherEvents.length === 0 && (
              <Text style={styles.emptyText}>
                You haven't created any events yet. Create one in the Teacher tab.
              </Text>
            )}
          </>
        }
        renderItem={({ item: event }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <View style={styles.countBadge}>
                <Ionicons name="people-outline" size={14} color={C.textOnPrimary} />
                <Text style={styles.countBadgeText}>{event.attendeeCount}</Text>
              </View>
            </View>

            <View style={styles.chipRow}>
              <Ionicons name="pricetag-outline" size={14} color={C.textSecondary} />
              <Text style={styles.codeChip}>{event.eventCode}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={C.textSecondary} />
              <Text style={styles.metaText}>
                {event.startTime ? formatDateTime(event.startTime) : 'No start time'}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="alarm-outline" size={14} color={C.textSecondary} />
              <Text style={styles.metaText}>
                Late after {event.lateAfterMinutes ?? 15} min
              </Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.attendeeHeader}>Attendees</Text>
            {event.attendees.length === 0 ? (
              <Text style={styles.attendeeEmpty}>No students have scanned yet.</Text>
            ) : (
              <AttendeeGroups attendees={event.attendees} />
            )}
          </View>
        )}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>
      <Text style={styles.subHeader}>Events you have scanned into</Text>

      {loading ? (
        <Text style={styles.emptyText}>Loading records...</Text>
      ) : studentRecords.length === 0 ? (
        <Text style={styles.emptyText}>
          No records yet. Scan a QR code to register your attendance.
        </Text>
      ) : (
        <FlatList
          data={studentRecords}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.eventTitle}>{item.eventTitle}</Text>
                <Text style={styles.statusChip}>{item.status}</Text>
              </View>
              <View style={styles.chipRow}>
                <Ionicons name="pricetag-outline" size={14} color={C.textSecondary} />
                <Text style={styles.codeChip}>{item.eventId}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={14} color={C.textSecondary} />
                <Text style={styles.metaText}>{formatDateTime(item.scannedAt)}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// Teacher view: attendees separated into Teachers/Staff vs Students,
// with students grouped by Program → Year Level → Block.
function AttendeeGroups({
  attendees,
}: {
  attendees: TeacherEventAttendance['attendees'];
}) {
  const C = useColors();
  const styles = makeStyles(C);

  const staff = attendees.filter((a) => a.role === 'teacher' || a.role === 'admin');
  const students = attendees.filter(
    (a) => !(a.role === 'teacher' || a.role === 'admin')
  );
  const buckets = groupByAcademic(students, (s) => ({
    program: s.program,
    year: s.yearLevel,
    block: s.block,
  }));

  const renderRow = (attendee: TeacherEventAttendance['attendees'][number]) => {
    const academic = [
      attendee.program,
      attendee.yearLevel,
      attendee.block ? `Block ${attendee.block}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <View key={attendee.studentId} style={styles.attendeeRow}>
        <View
          style={[
            styles.attendeeDot,
            attendee.status === 'late' && styles.attendeeDotLate,
          ]}
        />
        <View style={styles.attendeeInfo}>
          <Text style={styles.attendeeName}>
            {attendee.studentName || shortId(attendee.studentId)}
          </Text>
          {!!academic && (
            <Text style={styles.attendeeDetail}>{academic}</Text>
          )}
        </View>
        {attendee.status === 'late' && (
          <Text style={styles.lateBadge}>LATE</Text>
        )}
        <Text style={styles.attendeeTime}>
          {formatDateTime(attendee.scannedAt)}
        </Text>
      </View>
    );
  };

  return (
    <>
      {buckets.map((b) => (
        <View key={b.key}>
          <Text style={styles.bucketHeader}>
            {bucketLabel(b)} ({b.members.length})
          </Text>
          {b.members.map(renderRow)}
        </View>
      ))}
      {staff.length > 0 && (
        <>
          <Text style={styles.bucketHeader}>
            Teachers/Staff ({staff.length})
          </Text>
          {staff.map(renderRow)}
        </>
      )}
    </>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 2,
  },
  subHeader: {
    fontSize: 14,
    color: C.textSecondary,
    marginBottom: 20,
  },
  listContent: {
    paddingBottom: 32,
  },
  emptyText: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 20,
    marginTop: 8,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textPrimary,
    flexShrink: 1,
  },
  statusChip: {
    fontSize: 12,
    fontWeight: '700',
    color: C.success,
    textTransform: 'capitalize',
    marginLeft: 8,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
    gap: 4,
  },
  countBadgeText: {
    color: C.textOnPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  codeChip: {
    fontSize: 13,
    color: C.primary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: C.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },
  attendeeHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  bucketHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: C.primary,
    backgroundColor: C.primary + '14',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
    marginBottom: 2,
    overflow: 'hidden',
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  attendeeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.success,
    marginRight: 10,
  },
  attendeeDotLate: {
    backgroundColor: C.warning,
  },
  lateBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: C.warning,
    backgroundColor: C.warning + '1A',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    overflow: 'hidden',
  },
  attendeeName: {
    fontSize: 14,
    color: C.textPrimary,
    flexShrink: 1,
  },
  attendeeInfo: {
    flex: 1,
    flexShrink: 1,
  },
  attendeeDetail: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 1,
  },
  attendeeTime: {
    fontSize: 12,
    color: C.textSecondary,
    marginLeft: 8,
  },
  attendeeEmpty: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 4,
  },
});