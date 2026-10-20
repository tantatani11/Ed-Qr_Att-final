import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  createEvent,
  deleteEvent,
  getAllEvents,
  getEventsByTeacher,
  setEventStatus,
  updateEvent,
  effectiveStatus,
  type CloudEvent,
} from '@/lib/events';
import { formatDateTime } from '@/lib/format';
import { syncProfileFromMetadata, type Role } from '@/lib/profiles';
import { buildQRPayload } from '@/lib/qr';

// Send an absolute (UTC) timestamp. The DB column is `timestamptz`, so a
// timezone-less string like "2026-10-18T23:57:00" would be read as UTC and
// shift the event to the next day for UTC+8 users. toISOString() keeps the
// exact instant, and the UI re-renders it in the device's local time.
function toAbsoluteISO(date: Date) {
  return date.toISOString();
}

const QUICK_END_OPTIONS = [
  { label: '+30 min', ms: 30 * 60 * 1000 },
  { label: '+1 hour', ms: 60 * 60 * 1000 },
  { label: '+2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';

export default function TeacherScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [lateAfter, setLateAfter] = useState('15');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [payloadTitle, setPayloadTitle] = useState('');
  const [qrModal, setQrModal] = useState<{
    title: string;
    code: string;
    payload: string;
    lateAfter: number;
    status: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [myEvents, setMyEvents] = useState<CloudEvent[]>([]);
  const [editingCode, setEditingCode] = useState<string | null>(null);

  const isAndroid = Platform.OS === 'android';
  const canManage = role === 'teacher' || role === 'admin';

  const loadRoleAndEvents = useCallback(async () => {
    if (!user) {
      setRole(null);
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    const metaRole = (user.user_metadata as any)?.role as Role | undefined;
    try {
      // Heal the profiles row from signup metadata first: a teacher whose
      // DB role is still 'student' would otherwise be blocked by the
      // events INSERT RLS policy even though the Teacher tab is visible.
      const profile = await syncProfileFromMetadata(user);
      const dbRole = profile?.role;
      const effective: Role =
        dbRole === 'teacher' || dbRole === 'admin' || metaRole === 'teacher' || metaRole === 'admin'
          ? ((dbRole === 'admin' || metaRole === 'admin' ? 'admin' : 'teacher') as Role)
          : ((dbRole ?? metaRole ?? 'student') as Role);
      setRole(effective);
      if (effective === 'admin') {
        setMyEvents(await getAllEvents());
      } else if (effective === 'teacher') {
        setMyEvents(await getEventsByTeacher(user.id));
      } else {
        setMyEvents([]);
      }
    } catch {
      const fallback = (metaRole ?? 'student') as Role;
      setRole(fallback);
      setMyEvents([]);
    } finally {
      setRoleLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadRoleAndEvents();
    }, [loadRoleAndEvents])
  );

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setEditTarget(target);
    setEditingPart('date');
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (!editTarget) return;
    if (event.type === 'dismissed' || !selected) {
      setEditTarget(null);
      setEditingPart('date');
      return;
    }
    const current = editTarget === 'start' ? startDate : endDate;
    const next = new Date(current);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    if (editTarget === 'start') setStartDate(next);
    else setEndDate(next);
    if (isAndroid && editingPart === 'date') {
      setEditingPart('time');
    } else {
      setEditTarget(null);
      setEditingPart('date');
    }
  };

  const handleQuickEnd = (ms: number) => {
    setMessage(null);
    setEndDate(new Date(startDate.getTime() + ms));
  };

  const resetForm = () => {
    setTitle('');
    setEventId('');
    setVenue('');
    setDescription('');
    setLateAfter('15');
    setEditingCode(null);
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
  };

  // EVENT: Create pressed → HANDLER: handleCreateEvent → ACTION: validate + insert → RESULT: QR generated
  const handleCreateEvent = async () => {
    const lateMinutes = lateAfter.trim() === '' ? 15 : Number(lateAfter);
    if (!Number.isInteger(lateMinutes) || lateMinutes < 0 || lateMinutes > 1440) {
      setMessage('Late threshold must be a whole number from 0 to 1440 minutes.');
      return;
    }
    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toAbsoluteISO(startDate),
      end: toAbsoluteISO(endDate),
      venue: venue.trim(),
      description: description.trim(),
      status: 'open' as const,
      lateAfterMinutes: lateMinutes,
    };
    if (!event.eventId || !event.title) {
      setMessage('Event title and code are required.');
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setMessage('End time must be after start time.');
      return;
    }
    let result;
    if (editingCode) {
      result = await updateEvent(editingCode, {
        title: event.title,
        venue: event.venue || null,
        description: event.description || null,
        late_after_minutes: event.lateAfterMinutes,
        start_time: event.start,
        end_time: event.end,
      });
    } else {
      result = await createEvent(event);
    }
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(editingCode ? 'Event updated!' : 'Event saved! Scan the QR with the Scan tab to test it.');
    setPayload(buildQRPayload(event));
    setPayloadTitle(event.title);
    resetFormKeepQR();
    await loadRoleAndEvents();
  };

  const resetFormKeepQR = () => {
    setEditingCode(null);
  };

  const handleEdit = (ev: CloudEvent) => {
    setEditingCode(ev.event_code);
    setEventId(ev.event_code);
    setTitle(ev.title);
    setVenue(ev.venue ?? '');
    setDescription(ev.description ?? '');
    setLateAfter(String(ev.late_after_minutes ?? 15));
    if (ev.start_time) setStartDate(new Date(ev.start_time));
    if (ev.end_time) setEndDate(new Date(ev.end_time));
    setMessage(`Editing ${ev.event_code} — press Update to save.`);
  };

  // EVENT: QR button pressed → HANDLER: handleShowQR → ACTION: open QR
  // modal → RESULT: teacher can display the code for scanning, then close it.
  const handleShowQR = (ev: CloudEvent) => {
    setQrModal({
      title: ev.title,
      code: ev.event_code,
      payload: buildQRPayload({
        eventId: ev.event_code,
        title: ev.title,
        start: ev.start_time ?? undefined,
        end: ev.end_time ?? undefined,
        lateAfterMinutes: ev.late_after_minutes ?? 15,
      }),
      lateAfter: ev.late_after_minutes ?? 15,
      status: ev.status,
    });
  };

  const handleToggleStatus = async (ev: CloudEvent) => {
    const next = ev.status === 'closed' ? 'open' : 'closed';
    const { error } = await setEventStatus(ev.event_code, next);
    setMessage(error ?? `Event ${next === 'closed' ? 'closed — scans blocked' : 'reopened'}.`);
    await loadRoleAndEvents();
  };

  const handleDelete = async (ev: CloudEvent) => {
    const { error } = await deleteEvent(ev.event_code);
    setMessage(error ?? 'Event deleted.');
    await loadRoleAndEvents();
  };

  if (roleLoading) {
    return (
      <View style={styles.gateContainer}>
        <Text style={styles.gateText}>Checking your account...</Text>
      </View>
    );
  }

  if (!canManage) {
    return (
      <View style={styles.gateContainer}>
        <Ionicons name="lock-closed-outline" size={40} color={C.textSecondary} />
        <Text style={styles.gateTitle}>Teachers Only</Text>
        <Text style={styles.gateText}>Only teacher or admin accounts can manage events.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{editingCode ? 'Edit Event' : 'Create Event'}</Text>
      <Text style={styles.subtitle}>
        Fill in the event details, then scan the generated QR with the Scan tab.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Event Details</Text>
        <TextField label="Event Title" icon="text-outline" value={title} onChangeText={setTitle} placeholder="e.g. Founders Day Assembly" autoCapitalize="sentences" />
        <TextField label="Event Code" icon="pricetag-outline" value={eventId} onChangeText={setEventId} placeholder="e.g. EVT-2026-0002" autoCapitalize="characters" />
        <TextField label="Venue" icon="location-outline" value={venue} onChangeText={setVenue} placeholder="e.g. School Gymnasium" autoCapitalize="sentences" />
        <Text style={styles.fieldLabel}>Description</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. All students must attend..."
            placeholderTextColor={C.textSecondary}
            multiline
            numberOfLines={3}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Schedule</Text>
        <Text style={styles.fieldLabel}>Starts</Text>
        <PickerField value={formatDateTime(startDate.toISOString())} icon="sunny-outline" onPress={() => openPicker('start')} />
        <Text style={styles.fieldLabel}>Ends</Text>
        <PickerField value={formatDateTime(endDate.toISOString())} icon="moon-outline" onPress={() => openPicker('end')} />
        <Text style={styles.chipsLabel}>Quick end time</Text>
        <View style={styles.chipRow}>
          {QUICK_END_OPTIONS.map((option) => (
            <Pressable key={option.label} style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]} onPress={() => handleQuickEnd(option.ms)}>
              <Ionicons name="timer-outline" size={14} color={C.primary} />
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Attendance Rule</Text>
        <TextField label="Late after (minutes)" icon="alarm-outline" value={lateAfter} onChangeText={(v) => setLateAfter(v.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="e.g. 15" autoCapitalize="none" />
        <Text style={styles.hintText}>
          Student nga mo-scan lapas ani nga minutes gikan sa start time kay ma-mark nga LATE. 0 = bisan 1 ka segundo nga late, late na dayon.
        </Text>
        <View style={styles.chipRow}>
          {['5', '10', '15', '30'].map((preset) => (
            <Pressable key={preset} style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, lateAfter === preset && styles.chipSelected]} onPress={() => setLateAfter(preset)}>
              <Text style={styles.chipText}>{preset} min</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {message && <Text style={[styles.message, payload && styles.messageSuccess]}>{message}</Text>}

      <AppButton theme="primary" title={editingCode ? 'Update Event' : 'Create Event'} icon={editingCode ? 'save-outline' : 'add-circle-outline'} onPress={handleCreateEvent} />
      {editingCode && <AppButton title="Cancel Edit" icon="close-outline" onPress={resetForm} />}

      {editTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={editTarget === 'start' ? startDate : endDate}
            mode={isAndroid ? editingPart : 'datetime'}
            display={isAndroid ? 'default' : 'spinner'}
            onChange={onPickerChange}
          />
        </View>
      )}

      {payload && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Scan this QR code ({payloadTitle}):</Text>
          <View style={styles.qrBox}>
            <QRCode value={payload} size={200} />
          </View>
          <Text style={styles.payloadText}>{payload}</Text>
        </View>
      )}

      <Text style={styles.listTitle}>My Events ({myEvents.length})</Text>
      {myEvents.length === 0 ? (
        <Text style={styles.emptyText}>No events yet. Create one above.</Text>
      ) : (
        myEvents.map((ev) => {
          const eff = effectiveStatus(ev);
          return (
          <View key={ev.event_code} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <Text style={styles.eventTitle}>{ev.title}</Text>
              <View style={[styles.statusBadge, eff === 'closed' && styles.statusClosed]}>
                <Text style={styles.statusText}>{eff === 'closed' ? 'Closed' : 'Open'}</Text>
              </View>
            </View>
            <Text style={styles.eventCode}>{ev.event_code}</Text>
            {!!ev.venue && <Text style={styles.eventMeta}>📍 {ev.venue}</Text>}
            <Text style={styles.eventMeta}>{ev.start_time ? formatDateTime(ev.start_time) : 'No schedule'}</Text>
            <Text style={styles.eventMeta}>⏱ Late after {ev.late_after_minutes ?? 15} min</Text>
            <View style={styles.eventActions}>
              <Pressable style={styles.miniBtn} onPress={() => handleShowQR(ev)}>
                <Ionicons name="qr-code-outline" size={14} color={C.primary} />
                <Text style={styles.miniBtnText}>QR</Text>
              </Pressable>
              <Pressable style={styles.miniBtn} onPress={() => handleEdit(ev)}>
                <Ionicons name="pencil-outline" size={14} color={C.primary} />
                <Text style={styles.miniBtnText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.miniBtn} onPress={() => handleToggleStatus(ev)}>
                <Ionicons name={ev.status === 'closed' ? 'lock-open-outline' : 'lock-closed-outline'} size={14} color={C.primary} />
                <Text style={styles.miniBtnText}>{ev.status === 'closed' ? 'Reopen' : 'Close'}</Text>
              </Pressable>
              <Pressable style={styles.miniBtn} onPress={() => handleDelete(ev)}>
                <Ionicons name="trash-outline" size={14} color={C.danger} />
                <Text style={[styles.miniBtnText, { color: C.danger }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
          );
        })
      )}

      <Modal
        visible={qrModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModal(null)}
      >
        <View style={styles.modalWrap}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setQrModal(null)}
            accessibilityLabel="Close QR code"
          />
          <View style={styles.modalCard}>
            <Pressable style={styles.modalX} onPress={() => setQrModal(null)}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </Pressable>
            <Text style={styles.modalLabel}>Event QR Code</Text>
            <Text style={styles.modalTitle}>{qrModal?.title}</Text>
            <Text style={styles.modalCode}>{qrModal?.code}</Text>
            {qrModal && (
              <View style={styles.modalQrBox}>
                <QRCode value={qrModal.payload} size={230} />
              </View>
            )}
            <Text style={styles.modalMeta}>
              ⏱ Late after {qrModal?.lateAfter ?? 15} min
              {qrModal?.status === 'closed' ? ' · Closed — scans blocked' : ' · Open for scanning'}
            </Text>
            <Text style={styles.modalHint}>
              Ipakita ni sa mga estudyante para ilang ma-scan.
            </Text>
            <AppButton
              theme="primary"
              title="Close"
              icon="close-circle-outline"
              onPress={() => setQrModal(null)}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

type TextFieldProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize: 'none' | 'sentences' | 'words' | 'characters';
};

function TextField({ label, icon, value, onChangeText, placeholder, autoCapitalize }: TextFieldProps) {
  const C = useColors();
  const styles = makeStyles(C);
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={18} color={C.textSecondary} style={styles.inputIcon} />
        <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.textSecondary} autoCapitalize={autoCapitalize} />
      </View>
    </>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function PickerField({ value, icon, onPress }: PickerFieldProps) {
  const C = useColors();
  const styles = makeStyles(C);
  return (
    <Pressable style={({ pressed }) => [styles.pickerField, pressed && styles.pickerFieldPressed]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={C.primary} />
      <Text style={styles.pickerValue}>{value}</Text>
      <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: C.textPrimary, marginBottom: 2 },
  subtitle: { fontSize: 14, color: C.textSecondary, lineHeight: 20, marginBottom: 16 },
  section: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.textPrimary, marginBottom: 6, marginTop: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: C.textPrimary },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  pickerField: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  pickerFieldPressed: { opacity: 0.85 },
  pickerValue: { flex: 1, fontSize: 15, fontWeight: '500', color: C.textPrimary, marginHorizontal: 10 },
  chipsLabel: { fontSize: 13, fontWeight: '600', color: C.textPrimary, marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: 'row' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 999, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  chipPressed: { backgroundColor: C.primary + '14', borderColor: C.primary },
  chipSelected: { backgroundColor: C.primary + '14', borderColor: C.primary },
  hintText: { fontSize: 12, color: C.textSecondary, lineHeight: 17, marginTop: 8 },
  chipText: { fontSize: 13, fontWeight: '600', color: C.primary },
  pickerContainer: { marginTop: 12, alignItems: 'center' },
  message: { fontSize: 14, color: C.danger, textAlign: 'center', marginTop: 4, marginBottom: 10 },
  messageSuccess: { color: C.success },
  resultCard: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginTop: 16, alignItems: 'center' },
  resultTitle: { fontSize: 15, fontWeight: '600', color: C.textPrimary, textAlign: 'center', marginBottom: 12 },
  qrBox: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 10, marginBottom: 12 },
  payloadText: { fontSize: 12, color: C.textSecondary, textAlign: 'center', lineHeight: 16 },
  gateContainer: { flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  gateTitle: { fontSize: 20, fontWeight: '700', color: C.textPrimary, marginTop: 12, marginBottom: 6 },
  gateText: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  listTitle: { fontSize: 18, fontWeight: '700', color: C.textPrimary, marginTop: 20, marginBottom: 10 },
  emptyText: { fontSize: 14, color: C.textSecondary },
  eventCard: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, flex: 1 },
  statusBadge: { backgroundColor: C.success + '1A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusClosed: { backgroundColor: C.danger + '1A' },
  statusText: { fontSize: 12, fontWeight: '700', color: C.textPrimary },
  eventCode: { fontSize: 13, color: C.primary, fontWeight: '600', marginTop: 2 },
  eventMeta: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  eventActions: { flexDirection: 'row', marginTop: 10, gap: 8 },
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  miniBtnText: { fontSize: 13, fontWeight: '600', color: C.primary },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20, alignItems: 'center' },
  modalX: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  modalLabel: { fontSize: 12, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  modalTitle: { fontSize: 19, fontWeight: '700', color: C.textPrimary, textAlign: 'center', marginTop: 6 },
  modalCode: { fontSize: 14, fontWeight: '600', color: C.primary, marginTop: 2 },
  modalQrBox: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, marginVertical: 14 },
  modalMeta: { fontSize: 13, color: C.textSecondary, textAlign: 'center' },
  modalHint: { fontSize: 12, color: C.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 14 },
});
