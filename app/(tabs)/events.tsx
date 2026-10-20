import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';
import { getOpenEvents, type CloudEvent } from '@/lib/events';
import { formatDateTime } from '@/lib/format';

// Student view: available (open) events — EVENT: screen focused → refresh list
export default function EventsScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setEvents(await getOpenEvents());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Available Events</Text>
      <Text style={styles.subHeader}>Open events you can scan into</Text>
      {loading ? (
        <Text style={styles.emptyText}>Loading events...</Text>
      ) : events.length === 0 ? (
        <Text style={styles.emptyText}>
          No open events right now. Ask your teacher for the event QR code.
        </Text>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.event_code}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <View style={styles.openBadge}>
                  <Text style={styles.openBadgeText}>Open</Text>
                </View>
              </View>
              <View style={styles.chipRow}>
                <Ionicons name="pricetag-outline" size={14} color={C.textSecondary} />
                <Text style={styles.codeChip}>{item.event_code}</Text>
              </View>
              {!!item.venue && (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={14} color={C.textSecondary} />
                  <Text style={styles.metaText}>{item.venue}</Text>
                </View>
              )}
              {!!item.description && (
                <Text style={styles.desc}>{item.description}</Text>
              )}
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={14} color={C.textSecondary} />
                <Text style={styles.metaText}>
                  {item.start_time ? formatDateTime(item.start_time) : 'No start time'}
                  {item.end_time ? ` → ${formatDateTime(item.end_time)}` : ''}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="alarm-outline" size={14} color={C.textSecondary} />
                <Text style={styles.metaText}>
                  Late after {item.late_after_minutes ?? 15} min from start
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background, paddingHorizontal: 24, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: '700', color: C.textPrimary, marginBottom: 2 },
  subHeader: { fontSize: 14, color: C.textSecondary, marginBottom: 20 },
  listContent: { paddingBottom: 32 },
  emptyText: { fontSize: 14, color: C.textSecondary, lineHeight: 20, marginTop: 8 },
  card: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventTitle: { fontSize: 16, fontWeight: '600', color: C.textPrimary, flexShrink: 1 },
  openBadge: { backgroundColor: C.success + '1A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  openBadgeText: { color: C.success, fontWeight: '700', fontSize: 12 },
  chipRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  codeChip: { fontSize: 13, color: C.primary, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  metaText: { fontSize: 13, color: C.textSecondary, flexShrink: 1 },
  desc: { fontSize: 13, color: C.textPrimary, marginTop: 8, lineHeight: 18 },
});
