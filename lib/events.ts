import { supabase } from './supabase';

export type EventStatus = 'open' | 'closed';

export const DEFAULT_LATE_AFTER_MINUTES = 15;

// An event is "expired" once its end_time has passed (if it has one).
export function isEventExpired(ev: { end_time: string | null }): boolean {
  if (!ev.end_time) return false;
  const end = new Date(ev.end_time).getTime();
  return !Number.isNaN(end) && Date.now() > end;
}

// Effective status shown in the UI: an open event past its end_time counts
// as closed (scans are already rejected server-side by the trigger and
// client-side in registerAttendance). The stored status is flipped by the
// close_expired_events cron job in schema.sql.
export function effectiveStatus(ev: {
  status: EventStatus;
  end_time: string | null;
}): EventStatus {
  if (ev.status === 'closed') return 'closed';
  return isEventExpired(ev) ? 'closed' : 'open';
}

export type Event = {
  eventId: string; // the public event code from the UI, e.g. EVT-2026-0002
  title: string;
  start: string;
  end: string;
  venue?: string;
  description?: string;
  status?: EventStatus;
  lateAfterMinutes?: number;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  venue: string | null;
  description: string | null;
  status: EventStatus;
  late_after_minutes: number;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
};

function validateEvent(event: Event): string | null {
  if (!event.eventId.trim() || !event.title.trim()) {
    return 'Event title and code are required.';
  }
  if (!/^[A-Za-z0-9-]{3,32}$/.test(event.eventId.trim())) {
    return 'Event code must be 3–32 chars (letters, numbers, dash).';
  }
  if (event.title.trim().length > 120) return 'Title is too long (max 120).';
  if ((event.venue ?? '').length > 120) return 'Venue is too long (max 120).';
  if ((event.description ?? '').length > 500)
    return 'Description is too long (max 500).';
  if (event.start && event.end && new Date(event.end) <= new Date(event.start)) {
    return 'End time must be after start time.';
  }
  if (
    event.lateAfterMinutes !== undefined &&
    (!Number.isInteger(event.lateAfterMinutes) ||
      event.lateAfterMinutes < 0 ||
      event.lateAfterMinutes > 1440)
  ) {
    return 'Late threshold must be 0–1440 minutes.';
  }
  return null;
}

export async function createEvent(
  event: Event
): Promise<{ error: string | null }> {
  const validation = validateEvent(event);
  if (validation) return { error: validation };
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('events').upsert(
    {
      event_code: event.eventId.trim(),
      title: event.title.trim(),
      venue: event.venue?.trim() || null,
      description: event.description?.trim() || null,
      status: event.status ?? 'open',
      late_after_minutes: event.lateAfterMinutes ?? DEFAULT_LATE_AFTER_MINUTES,
      start_time: event.start || null,
      end_time: event.end || null,
      created_by: user?.id ?? null,
    },
    { onConflict: 'event_code' }
  );

  return { error: error?.message ?? null };
}

export async function updateEvent(
  eventCode: string,
  updates: Partial<Pick<CloudEvent, 'title' | 'venue' | 'description' | 'status' | 'late_after_minutes' | 'start_time' | 'end_time'>>
): Promise<{ error: string | null }> {
  if (updates.title !== undefined && !updates.title.trim()) {
    return { error: 'Title cannot be empty.' };
  }
  if (
    updates.late_after_minutes !== undefined &&
    (!Number.isInteger(updates.late_after_minutes) ||
      updates.late_after_minutes < 0 ||
      updates.late_after_minutes > 1440)
  ) {
    return { error: 'Late threshold must be 0–1440 minutes.' };
  }
  const { error } = await supabase
    .from('events')
    .update(updates)
    .eq('event_code', eventCode);
  return { error: error?.message ?? null };
}

// EVENT: teacher presses Close/Reopen → HANDLER: setEventStatus → ACTION: update status → RESULT: scans blocked/allowed
export async function setEventStatus(
  eventCode: string,
  status: EventStatus
): Promise<{ error: string | null }> {
  return updateEvent(eventCode, { status });
}

export async function deleteEvent(
  eventCode: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('event_code', eventCode);
  return { error: error?.message ?? null };
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as CloudEvent[];
}

export async function getAllEvents(): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as CloudEvent[];
}

export async function getOpenEvents(): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'open')
    .order('start_time', { ascending: true });
  if (error || !data) return [];
  // Hide events whose end_time already passed (may not be flipped to
  // 'closed' in the DB yet if the cron job hasn't run).
  return (data as CloudEvent[]).filter((e) => !isEventExpired(e));
}

export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code.trim())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}
