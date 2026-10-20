import { supabase } from './supabase';
import { parseQRPayload } from './qr';
import { getEventByCode } from './events';
import { invalidateProfile } from './profiles';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  status: string;
  scannedAt: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
  status?: string;
};

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  lateAfterMinutes: number;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName: string | null;
    role: string | null;
    yearLevel: string | null;
    program: string | null;
    block: string | null;
    status: string;
    scannedAt: string;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }
  const payload = parsed.payload;
  const now = Date.now();

  // Only pre-registered events are valid — unknown codes are rejected,
  // so students cannot invent events by crafting a QR payload.
  const foundEvent = await getEventByCode(payload.event);
  if (!foundEvent) {
    return { success: false, message: 'Invalid QR code: event not found.' };
  }
  // VALIDATION: closed events reject new scans
  if ((foundEvent as any).status === 'closed') {
    return {
      success: false,
      message: 'This event is closed. Attendance is no longer accepted.',
      eventTitle: foundEvent.title,
    };
  }

  // DB is the source of truth for schedule + late rule; the QR payload
  // is only a fallback for older events created before the column existed.
  const dbStart = foundEvent.start_time ? new Date(foundEvent.start_time).getTime() : null;
  const dbEnd = foundEvent.end_time ? new Date(foundEvent.end_time).getTime() : null;
  const start = dbStart ?? (payload.start ? new Date(payload.start).getTime() : null);
  const end = dbEnd ?? (payload.end ? new Date(payload.end).getTime() : null);

  if (start && now < start) {
    return { success: false, message: 'Event has not started yet.' };
  }
  if (end && now > end) {
    return { success: false, message: 'Event has already ended.' };
  }
  const event: { id: string; title: string } = foundEvent;

  // LATE RULE: scan later than start + threshold minutes → recorded as late.
  // Threshold is set per event by teacher/admin (default 15 min).
  const lateAfter =
    (foundEvent as any).late_after_minutes ?? payload.lateAfter ?? 15;
  const isLate =
    start !== null && !Number.isNaN(start) && now > start + lateAfter * 60 * 1000;
  const finalStatus = isLate ? 'late' : 'present';

  const { error: attError } = await supabase.from('attendance').insert([
    { student_id: studentId, event_id: event.id, status: finalStatus },
  ]);

  if (attError) {
    if (attError.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle: event.title,
      };
    }
    // The server-side trigger in schema.sql enforces the schedule/closed
    // rules so they cannot be bypassed by calling the API directly.
    const raw = `${attError.message ?? ''}`;
    if (raw.includes('EVENT_CLOSED')) {
      return {
        success: false,
        message: 'This event is closed. Attendance is no longer accepted.',
        eventTitle: event.title,
      };
    }
    if (raw.includes('EVENT_NOT_STARTED')) {
      return { success: false, message: 'Event has not started yet.', eventTitle: event.title };
    }
    if (raw.includes('EVENT_ENDED')) {
      return { success: false, message: 'Event has already ended.', eventTitle: event.title };
    }
    return { success: false, message: attError.message };
  }

  return {
    success: true,
    message: isLate
      ? `Attendance recorded — marked LATE (over ${lateAfter} min).`
      : 'Attendance recorded!',
    eventTitle: event.title,
    status: finalStatus,
  };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  let { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, status, events ( event_code, title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error) {
    // Older DBs without the status column → retry without it.
    const retry = await supabase
      .from('attendance')
      .select('id, scanned_at, events ( event_code, title )')
      .eq('student_id', studentId)
      .order('scanned_at', { ascending: false });
    data = retry.data as any;
    error = retry.error as any;
  }

  if (error || !data) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    status: row.status ?? 'present',
    scannedAt: row.scanned_at,
  }));
}

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  // select('*') so this keeps working whether or not the DB already has
  // the newer columns (venue, status, late_after_minutes).
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) return [];

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  let { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id, status')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attError) {
    // Older DBs without the status column → retry without it.
    const retry = await supabase
      .from('attendance')
      .select('student_id, scanned_at, event_id')
      .in('event_id', eventIds)
      .order('scanned_at', { ascending: false });
    attendance = retry.data as any;
    attError = retry.error as any;
  }

  if (attError || !attendance) return [];

  // Phase 10 follow-up: show attendee names.
  // Reads only the attendees' profiles (allowed by the RLS policy
  // "Teachers can view profiles of their attendees"), keyed by id.
  const studentIds = Array.from(
    new Set(attendance.map((a: any) => a.student_id))
  );
  const infoMap = new Map<
    string,
    { name: string | null; role: string | null; year: string | null; program: string | null; block: string | null }
  >();
  if (studentIds.length > 0) {
    let { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role, year_level, program, block')
      .in('id', studentIds);
    if (!profiles) {
      // Older DBs without academic columns → names only.
      const retry = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', studentIds);
      profiles = retry.data as any;
    }
    (profiles ?? []).forEach((p: any) => {
      infoMap.set(p.id, {
        name: p.full_name,
        role: p.role ?? null,
        year: p.year_level ?? null,
        program: p.program ?? null,
        block: p.block ?? null,
      });
    });
  }

  return events.map((e: any) => {
    const rows = attendance.filter((a: any) => a.event_id === e.id);
    return {
      eventId: e.id,
      eventCode: e.event_code,
      title: e.title,
      startTime: e.start_time,
      endTime: e.end_time,
      lateAfterMinutes: e.late_after_minutes ?? 15,
      attendeeCount: rows.length,
      attendees: rows.map((a: any) => ({
        studentId: a.student_id,
        studentName: infoMap.get(a.student_id)?.name ?? null,
        role: infoMap.get(a.student_id)?.role ?? null,
        yearLevel: infoMap.get(a.student_id)?.year ?? null,
        program: infoMap.get(a.student_id)?.program ?? null,
        block: infoMap.get(a.student_id)?.block ?? null,
        status: a.status ?? 'present',
        scannedAt: a.scanned_at,
      })),
    };
  });
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) return [];

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  // Count-only fetch: just the event_id column, nothing else.
  const { data: attRows, error: attError } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  if (attError || !attRows) return [];

  const counts: Record<string, number> = {};
  attRows.forEach((r: any) => {
    counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
  });

  return events.map((e: any) => ({
    eventId: e.id,
    eventCode: e.event_code,
    title: e.title,
    attendeeCount: counts[e.id] ?? 0,
  }));
}

// ---------- Admin: overall attendance + corrections + reports ----------

export type AdminAttendanceRow = {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  role: string | null;
  program: string | null;
  yearLevel: string | null;
  block: string | null;
  eventCode: string;
  eventTitle: string;
  status: string;
  scannedAt: string;
};

export async function getAllAttendance(
  options: { limit?: number; offset?: number } = {}
): Promise<AdminAttendanceRow[]> {
  // Paginated: pass { limit, offset } to fetch further pages instead of
  // always pulling the first (large) page.
  const limit = options.limit ?? 500;
  const offset = options.offset ?? 0;
  const rangeEnd = offset + limit - 1;

  let { data, error } = await supabase
    .from('attendance')
    .select('id, student_id, status, scanned_at, events ( event_code, title )')
    .order('scanned_at', { ascending: false })
    .range(offset, rangeEnd);
  if (error) {
    // Older DBs without the status column → retry without it.
    const retry = await supabase
      .from('attendance')
      .select('id, student_id, scanned_at, events ( event_code, title )')
      .order('scanned_at', { ascending: false })
      .range(offset, rangeEnd);
    data = retry.data as any;
    error = retry.error as any;
  }
  if (error || !data) return [];
  const studentIds = Array.from(new Set((data as any[]).map((r) => r.student_id)));
  type Info = {
    name: string | null;
    email: string | null;
    role: string | null;
    program: string | null;
    yearLevel: string | null;
    block: string | null;
  };
  const nameMap = new Map<string, Info>();
  if (studentIds.length > 0) {
    // Academic + role columns power the Program → Year → Block grouping in
    // the Admin attendance tab.
    let { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, year_level, program, block')
      .in('id', studentIds);
    if (!profiles) {
      // Older DBs without academic columns → names only.
      const retry = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds);
      profiles = retry.data as any;
    }
    (profiles ?? []).forEach((p: any) =>
      nameMap.set(p.id, {
        name: p.full_name,
        email: p.email,
        role: p.role ?? null,
        program: p.program ?? null,
        yearLevel: p.year_level ?? null,
        block: p.block ?? null,
      })
    );
  }
  return (data as any[]).map((r) => {
    const info = nameMap.get(r.student_id);
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: info?.name ?? null,
      studentEmail: info?.email ?? null,
      role: info?.role ?? null,
      program: info?.program ?? null,
      yearLevel: info?.yearLevel ?? null,
      block: info?.block ?? null,
      eventCode: r.events?.event_code ?? '',
      eventTitle: r.events?.title ?? '',
      status: r.status ?? 'present',
      scannedAt: r.scanned_at,
    };
  });
}

export async function updateAttendanceStatus(
  id: string,
  status: 'present' | 'late' | 'excused' | 'absent'
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('attendance').update({ status }).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteAttendance(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('attendance').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  year_level: string | null;
  program: string | null;
  block: string | null;
};

export async function getAllUsers(): Promise<AdminUserRow[]> {
  let { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, year_level, program, block')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    // Older DBs without academic columns → retry with base columns.
    const retry = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .order('created_at', { ascending: false })
      .limit(500);
    data = (retry.data as any[])?.map((u) => ({
      ...u,
      year_level: null,
      program: null,
      block: null,
    })) as any;
    error = retry.error as any;
  }
  if (error || !data) return [];
  return data as AdminUserRow[];
}

export async function updateUserRole(
  id: string,
  role: 'student' | 'teacher' | 'admin'
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (!error) invalidateProfile(id);
  return { error: error?.message ?? null };
}

export type SystemReport = {
  totalUsers: number;
  totalEvents: number;
  openEvents: number;
  closedEvents: number;
  totalAttendance: number;
};

export async function getSystemReport(): Promise<SystemReport> {
  // Count-only queries (head: true) — no row data transferred.
  const [users, events, openEvents, attendance] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'closed'),
    supabase.from('attendance').select('id', { count: 'exact', head: true }),
  ]);
  const totalEvents = events.count ?? 0;
  const openCount = openEvents.count ?? 0;
  return {
    totalUsers: users.count ?? 0,
    totalEvents,
    openEvents: openCount,
    closedEvents: Math.max(totalEvents - openCount, 0),
    totalAttendance: attendance.count ?? 0,
  };
}