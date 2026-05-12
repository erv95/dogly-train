import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  listSecurityEvents,
  SecurityEvent,
  SecurityEventType,
} from '../../services/adminEvents';
import { colors, spacing, fontSize, borderRadius } from '../../theme';

/**
 * Audit log viewer. Filter by event type; tap a row to see raw JSON payload.
 * No realtime here — events are append-only audit data, so a manual refresh
 * is fine and cheaper on Firestore reads.
 */

interface FilterOpt {
  key: SecurityEventType | 'all';
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const FILTERS: FilterOpt[] = [
  { key: 'all', labelKey: 'admin.events.filterAll', icon: 'list-outline' },
  { key: 'revoke_all_sessions', labelKey: 'admin.events.filterRevokeSessions', icon: 'phone-portrait-outline' },
  { key: 'data_export', labelKey: 'admin.events.filterDataExport', icon: 'download-outline' },
  { key: 'dispute_opened', labelKey: 'admin.events.filterDispute', icon: 'flag-outline' },
  { key: 'account_deletion_requested', labelKey: 'admin.events.filterDeletion', icon: 'trash-outline' },
];

const ICON_BY_TYPE: Record<string, keyof typeof Ionicons.glyphMap> = {
  revoke_all_sessions: 'phone-portrait-outline',
  data_export: 'download-outline',
  dispute_opened: 'flag-outline',
  account_deletion_requested: 'trash-outline',
  account_deletion_cancelled: 'arrow-undo-outline',
};

export function AdminEventsTab() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<SecurityEventType | 'all'>('all');
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSecurityEvents({
        type: filter === 'all' ? undefined : filter,
      });
      setEvents(list);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.filtersRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(f) => f.key}
          contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, filter === item.key && styles.chipActive]}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={item.icon}
                size={14}
                color={filter === item.key ? '#fff' : colors.textSecondary}
              />
              <Text
                style={[styles.chipText, filter === item.key && styles.chipTextActive]}
              >
                {t(item.labelKey)}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>{t('admin.events.empty')}</Text>
        }
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        renderItem={({ item }) => {
          const date = (item.createdAt as any)?.toDate?.()?.toLocaleString?.() ?? '—';
          const isOpen = expanded === item.id;
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => setExpanded(isOpen ? null : item.id)}
              activeOpacity={0.85}
            >
              <View style={styles.rowHeader}>
                <Ionicons
                  name={ICON_BY_TYPE[item.type] ?? 'alert-circle-outline'}
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.rowType}>{item.type}</Text>
                <Text style={styles.rowDate}>{date}</Text>
              </View>
              <Text style={styles.rowUid}>uid: {item.userId}</Text>
              {item.ip ? <Text style={styles.rowMeta}>ip: {item.ip}</Text> : null}
              {isOpen ? (
                <Text style={styles.rowJson}>
                  {JSON.stringify(item, null, 2)}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filtersRow: { paddingVertical: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  row: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowType: { flex: 1, fontWeight: '700', color: colors.text, fontSize: fontSize.sm },
  rowDate: { color: colors.textLight, fontSize: fontSize.xs },
  rowUid: { color: colors.textSecondary, fontSize: fontSize.xs, fontFamily: 'monospace' },
  rowMeta: { color: colors.textLight, fontSize: fontSize.xs, fontFamily: 'monospace' },
  rowJson: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.text,
    marginTop: spacing.xs,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
});
