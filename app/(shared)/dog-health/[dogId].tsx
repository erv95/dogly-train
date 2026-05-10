import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../../src/contexts/AuthContext';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import {
  createReminder,
  updateReminder,
  deleteReminder,
  completeReminder,
  getDogReminders,
} from '../../../src/services/reminders';
import { upsertWeight, removeWeight } from '../../../src/services/dogWeights';
import {
  createWalk,
  deleteWalk,
  getDogWalks,
  computeWeekStats,
  WeekStats,
} from '../../../src/services/dogWalks';
import {
  createVetRecord,
  updateVetRecord,
  deleteVetRecord,
  getVetRecords,
} from '../../../src/services/vetRecords';
import { exportVetRecordsPdf } from '../../../src/services/vetRecordsExport';
import { pickAndUploadImage } from '../../../src/utils/photo';
import {
  DogReminder, ReminderType, ReminderRecurrence,
  Dog, DogIssue, WeightEntry, DogWalk, WalkWeather, WalkEnergy,
  VetRecord, VetRecordType, VetSeverity,
} from '../../../src/types';
import WeightChart from '../../../src/components/WeightChart';
import { BEHAVIOR_GUIDES, sortGuidesForDog } from '../../../src/data/behaviorGuides';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';

const VET_RECORD_TYPES: VetRecordType[] = ['vaccine', 'visit', 'allergy', 'medication', 'surgery', 'lab_result'];
const VET_SEVERITIES: VetSeverity[] = ['low', 'medium', 'high'];

const VET_TYPE_ICONS: Record<VetRecordType, keyof typeof Ionicons.glyphMap> = {
  vaccine: 'medkit',
  visit: 'fitness',
  allergy: 'warning',
  medication: 'flask',
  surgery: 'cut',
  lab_result: 'pulse',
};

const VET_TYPE_COLORS: Record<VetRecordType, string> = {
  vaccine: '#10B981',
  visit: '#3B82F6',
  allergy: '#F59E0B',
  medication: '#8B5CF6',
  surgery: '#EF4444',
  lab_result: '#06B6D4',
};

const TYPES: ReminderType[] = ['vaccine', 'vet', 'grooming', 'other'];
const RECURRENCES: ReminderRecurrence[] = ['none', 'monthly', 'quarterly', 'biannual', 'annual'];

const TYPE_ICONS: Record<ReminderType, keyof typeof Ionicons.glyphMap> = {
  vaccine: 'medical',
  vet: 'fitness',
  grooming: 'cut',
  other: 'ellipsis-horizontal',
};

const TYPE_COLORS: Record<ReminderType, string> = {
  vaccine: '#EF4444',
  vet: '#3B82F6',
  grooming: '#A855F7',
  other: '#6B7280',
};

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DogHealthScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const { dogId, dogName } = useLocalSearchParams<{ dogId: string; dogName: string }>();
  const decodedName = dogName ? decodeURIComponent(dogName) : '';

  const [activeTab, setActiveTab] = useState<'reminders' | 'weight' | 'guides' | 'walks' | 'vet'>('reminders');
  const [reminders, setReminders] = useState<DogReminder[]>([]);
  const [dog, setDog] = useState<Dog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form modal state
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<DogReminder | null>(null);
  const [weightFormVisible, setWeightFormVisible] = useState(false);
  const [editingWeight, setEditingWeight] = useState<WeightEntry | null>(null);
  const [walkFormVisible, setWalkFormVisible] = useState(false);
  const [walks, setWalks] = useState<DogWalk[]>([]);
  const [walksLoading, setWalksLoading] = useState(false);
  const [walksLoaded, setWalksLoaded] = useState(false);

  // Vet records (lazy loaded when tab opens)
  const [vetRecords, setVetRecords] = useState<VetRecord[]>([]);
  const [vetLoading, setVetLoading] = useState(false);
  const [vetLoaded, setVetLoaded] = useState(false);
  const [vetFormVisible, setVetFormVisible] = useState(false);
  const [editingVet, setEditingVet] = useState<VetRecord | null>(null);
  const [vetTypeFilter, setVetTypeFilter] = useState<VetRecordType | 'all'>('all');
  const [vetExporting, setVetExporting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: decodedName ? `${decodedName} · ${t('health.title')}` : t('health.title') });
  }, [navigation, t, decodedName]);

  const load = useCallback(async () => {
    if (!dogId || !firebaseUser) return;
    try {
      const result = await getDogReminders(dogId, firebaseUser.uid);
      setReminders(result);
    } catch (err) {
      console.error('Error loading reminders', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dogId, firebaseUser?.uid]);

  useEffect(() => { load(); }, [load]);

  // Load walks lazily (only first time the walks tab is opened, or on demand
  // after creating a new one). The `walksLoaded` flag breaks the re-render loop
  // that occurs when the result is an empty array (length 0 keeps re-triggering).
  const loadWalks = useCallback(async () => {
    if (!dogId || !firebaseUser) return;
    setWalksLoading(true);
    try {
      const result = await getDogWalks(dogId, firebaseUser.uid, 100);
      setWalks(result);
    } catch (err) {
      console.error('Error loading walks', err);
    } finally {
      setWalksLoading(false);
      setWalksLoaded(true);
    }
  }, [dogId, firebaseUser?.uid]);

  useEffect(() => {
    if (activeTab === 'walks' && !walksLoaded && !walksLoading) {
      loadWalks();
    }
  }, [activeTab, walksLoaded, walksLoading, loadWalks]);

  // Reset cached walks when switching dog so the fresh tab loads new data.
  useEffect(() => {
    setWalks([]);
    setWalksLoaded(false);
    setVetRecords([]);
    setVetLoaded(false);
  }, [dogId]);

  // Vet records lazy loader (same pattern as walks: walksLoaded flag avoids
  // re-fetch loops when the result is an empty array).
  const loadVetRecords = useCallback(async () => {
    if (!dogId || !firebaseUser) return;
    setVetLoading(true);
    try {
      const result = await getVetRecords(dogId, firebaseUser.uid);
      setVetRecords(result);
    } catch (err) {
      console.error('Error loading vet records', err);
    } finally {
      setVetLoading(false);
      setVetLoaded(true);
    }
  }, [dogId, firebaseUser?.uid]);

  useEffect(() => {
    if (activeTab === 'vet' && !vetLoaded && !vetLoading) {
      loadVetRecords();
    }
  }, [activeTab, vetLoaded, vetLoading, loadVetRecords]);

  // Live subscription to dog doc (for weights tab)
  useEffect(() => {
    if (!dogId) return;
    const unsub = onSnapshot(doc(db, 'dogs', dogId), (snap) => {
      if (snap.exists()) {
        setDog({ id: snap.id, ...snap.data() } as Dog);
      }
    });
    return unsub;
  }, [dogId]);

  const openNew = () => { setEditing(null); setFormVisible(true); };
  const openEdit = (r: DogReminder) => { setEditing(r); setFormVisible(true); };
  const openNewWeight = () => { setEditingWeight(null); setWeightFormVisible(true); };
  const openEditWeight = (w: WeightEntry) => { setEditingWeight(w); setWeightFormVisible(true); };

  const handleDeleteWeight = (w: WeightEntry) => {
    Alert.alert(
      t('weight.deleteConfirm'),
      `${w.value} kg · ${w.date}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!dogId) return;
            try {
              await removeWeight(dogId, w.date);
            } catch {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            }
          },
        },
      ]
    );
  };

  const handleComplete = async (r: DogReminder) => {
    try {
      await completeReminder(r);
      load();
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    }
  };

  const handleDelete = (r: DogReminder) => {
    Alert.alert(
      t('health.deleteConfirm'),
      r.title,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReminder(r);
              load();
            } catch {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            }
          },
        },
      ]
    );
  };

  const weights: WeightEntry[] = useMemo(
    () => Array.isArray(dog?.weights) ? dog!.weights : [],
    [dog?.weights]
  );
  const sortedWeights = useMemo(
    () => [...weights].sort((a, b) => b.date.localeCompare(a.date)),
    [weights]
  );

  const dogIssues: DogIssue[] = useMemo(
    () => (dog?.issues ?? []).filter((i) => i !== 'other'),
    [dog?.issues]
  );

  // Filtered vet records by chip
  const filteredVetRecords = useMemo(
    () => vetTypeFilter === 'all' ? vetRecords : vetRecords.filter((r) => r.type === vetTypeFilter),
    [vetRecords, vetTypeFilter],
  );

  const handleExportVet = async () => {
    if (!dog || vetRecords.length === 0 || vetExporting) return;
    setVetExporting(true);
    try {
      const typeLabel: Record<VetRecordType, string> = {
        vaccine: t('vetRecords.types.vaccine'),
        visit: t('vetRecords.types.visit'),
        allergy: t('vetRecords.types.allergy'),
        medication: t('vetRecords.types.medication'),
        surgery: t('vetRecords.types.surgery'),
        lab_result: t('vetRecords.types.lab_result'),
      };
      await exportVetRecordsPdf({
        dog,
        records: vetRecords,
        locale: i18n.language,
        strings: {
          title: t('vetRecords.exportTitle'),
          subtitle: t('vetRecords.exportSubtitle'),
          dogName: t('dogs.name'),
          dogBreed: t('dogs.breed'),
          dogAge: t('dogs.age'),
          ageYears: t('dogs.ageYears'),
          ageMonths: t('dogs.ageMonths'),
          emptyHint: t('vetRecords.emptyTitle'),
          typeLabel,
          fields: {
            date: t('vetRecords.fields.date'),
            vetName: t('vetRecords.fields.vetName'),
            clinic: t('vetRecords.fields.clinic'),
            notes: t('vetRecords.fields.notes'),
            productName: t('vetRecords.fields.productName'),
            batchNumber: t('vetRecords.fields.batchNumber'),
            nextDueAt: t('vetRecords.fields.nextDueAt'),
            severity: t('vetRecords.fields.severity'),
          },
          severity: {
            low: t('vetRecords.severity.low'),
            medium: t('vetRecords.severity.medium'),
            high: t('vetRecords.severity.high'),
          },
          generatedOn: t('vetRecords.generatedOn'),
          signature: 'Dogly Train',
          signatureSubtitle: t('vetRecords.signatureSubtitle'),
          shareDialogTitle: t('vetRecords.shareDialogTitle'),
        },
      });
    } catch (err) {
      console.error('Export vet records error', err);
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setVetExporting(false);
    }
  };

  const handleDeleteVet = (r: VetRecord) => {
    Alert.alert(
      t('vetRecords.deleteConfirm'),
      r.title,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVetRecord(r.id);
              loadVetRecords();
            } catch {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            }
          },
        },
      ],
    );
  };
  const orderedGuides = useMemo(
    () => sortGuidesForDog(dogIssues),
    [dogIssues]
  );
  const matchedSet = useMemo(() => new Set(dogIssues), [dogIssues]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Plan semanal + Retos banners */}
      <View style={styles.bannersRow}>
        <TouchableOpacity
          style={[styles.bannerSmall, styles.bannerWeekly]}
          onPress={() => router.push(`/(shared)/weekly-plan/${dogId}`)}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar" size={18} color={colors.primary} />
          <Text style={styles.bannerSmallTitle}>{t('weeklyPlan.title')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bannerSmall, styles.bannerChallenges]}
          onPress={() => router.push(`/(shared)/challenges?dogId=${dogId}`)}
          activeOpacity={0.85}
        >
          <Ionicons name="trophy" size={18} color="#9B51E0" />
          <Text style={styles.bannerSmallTitle}>{t('challenges.title')}</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reminders' && styles.tabActive]}
          onPress={() => setActiveTab('reminders')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="medkit-outline"
            size={18}
            color={activeTab === 'reminders' ? colors.primary : colors.textLight}
          />
          <Text style={[styles.tabText, activeTab === 'reminders' && styles.tabTextActive]}>
            {t('health.title')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'weight' && styles.tabActive]}
          onPress={() => setActiveTab('weight')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="scale-outline"
            size={18}
            color={activeTab === 'weight' ? colors.primary : colors.textLight}
          />
          <Text style={[styles.tabText, activeTab === 'weight' && styles.tabTextActive]}>
            {t('weight.title')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'guides' && styles.tabActive]}
          onPress={() => setActiveTab('guides')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="library-outline"
            size={18}
            color={activeTab === 'guides' ? colors.primary : colors.textLight}
          />
          <Text style={[styles.tabText, activeTab === 'guides' && styles.tabTextActive]}>
            {t('guides.tabTitle')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'walks' && styles.tabActive]}
          onPress={() => setActiveTab('walks')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="walk-outline"
            size={18}
            color={activeTab === 'walks' ? colors.primary : colors.textLight}
          />
          <Text style={[styles.tabText, activeTab === 'walks' && styles.tabTextActive]}>
            {t('walks.tabTitle')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'vet' && styles.tabActive]}
          onPress={() => setActiveTab('vet')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={activeTab === 'vet' ? colors.primary : colors.textLight}
          />
          <Text style={[styles.tabText, activeTab === 'vet' && styles.tabTextActive]}>
            {t('vetRecords.tabTitle')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            colors={[colors.primary]}
          />
        }
      >
        {activeTab === 'vet' ? (
          /* ── Vet records tab ─────────────────────────────────────────── */
          vetLoading ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.xxl }} />
          ) : vetRecords.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons name="document-text-outline" size={48} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t('vetRecords.emptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('vetRecords.emptySubtitle')}</Text>
            </View>
          ) : (
            <>
              {/* Filter chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vetFilterRow}>
                <FilterChip
                  active={vetTypeFilter === 'all'}
                  onPress={() => setVetTypeFilter('all')}
                  label={t('vetRecords.filterAll')}
                  color={colors.primary}
                />
                {VET_RECORD_TYPES.map((type) => (
                  <FilterChip
                    key={type}
                    active={vetTypeFilter === type}
                    onPress={() => setVetTypeFilter(type)}
                    label={t(`vetRecords.types.${type}`)}
                    color={VET_TYPE_COLORS[type]}
                  />
                ))}
              </ScrollView>

              {/* Export button */}
              <TouchableOpacity
                style={styles.vetExportBtn}
                onPress={handleExportVet}
                disabled={vetExporting}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={vetExporting ? 'hourglass-outline' : 'document-text'}
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.vetExportBtnText}>{t('vetRecords.exportPdf')}</Text>
              </TouchableOpacity>

              {/* Records list */}
              {filteredVetRecords.length === 0 ? (
                <Text style={styles.hint}>{t('vetRecords.noResultsForFilter')}</Text>
              ) : (
                filteredVetRecords.map((r) => {
                  const tint = VET_TYPE_COLORS[r.type];
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={styles.vetRow}
                      onPress={() => { setEditingVet(r); setVetFormVisible(true); }}
                      onLongPress={() => handleDeleteVet(r)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.vetRowIcon, { backgroundColor: tint + '22' }]}>
                        <Ionicons name={VET_TYPE_ICONS[r.type]} size={20} color={tint} />
                      </View>
                      <View style={styles.vetRowBody}>
                        <View style={styles.vetRowTopRow}>
                          <Text style={styles.vetRowTitle} numberOfLines={1}>{r.title}</Text>
                          <View style={[styles.vetTypeTag, { backgroundColor: tint }]}>
                            <Text style={styles.vetTypeTagText}>
                              {t(`vetRecords.types.${r.type}`)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.vetRowDate}>
                          {formatDate(r.date.toDate(), i18n.language)}
                          {r.vetName ? ` · ${r.vetName}` : ''}
                          {r.clinic ? ` · ${r.clinic}` : ''}
                        </Text>
                        {r.notes && (
                          <Text style={styles.vetRowNotes} numberOfLines={2}>
                            {r.notes}
                          </Text>
                        )}
                        {r.attachmentURL && (
                          <View style={styles.vetAttachmentBadge}>
                            <Ionicons name="attach" size={12} color={colors.primary} />
                            <Text style={styles.vetAttachmentText}>
                              {r.attachmentMime === 'application/pdf' ? 'PDF' : t('vetRecords.imageAttached')}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <Text style={styles.hint}>{t('health.longPressHint')}</Text>
            </>
          )
        ) : activeTab === 'walks' ? (
          /* ── Walks tab ───────────────────────────────────────────────── */
          walksLoading ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.xxl }} />
          ) : walks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons name="walk-outline" size={48} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t('walks.emptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('walks.emptySubtitle')}</Text>
              <TouchableOpacity
                style={styles.gpsTrackerCta}
                onPress={() => router.push(`/(shared)/walk-tracker/${dogId}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="locate" size={18} color={colors.textOnPrimary} />
                <Text style={styles.gpsTrackerCtaText}>{t('walkTracker.startGps')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Week stats */}
              <WalksWeekSummary stats={computeWeekStats(walks)} />

              {/* GPS tracker CTA */}
              <TouchableOpacity
                style={styles.gpsTrackerCta}
                onPress={() => router.push(`/(shared)/walk-tracker/${dogId}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="locate" size={18} color={colors.textOnPrimary} />
                <Text style={styles.gpsTrackerCtaText}>{t('walkTracker.startGps')}</Text>
              </TouchableOpacity>

              {/* History list */}
              <Text style={styles.historyTitle}>{t('walks.historyLabel')}</Text>
              {walks.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={styles.walkRow}
                  onPress={() => router.push(`/(shared)/walk/${w.id}`)}
                  onLongPress={() => {
                    Alert.alert(
                      t('walks.deleteConfirm'),
                      `${formatDate(w.startedAt.toDate(), i18n.language)} · ${w.durationMinutes} min`,
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('common.delete'),
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await deleteWalk(w.id);
                              loadWalks();
                            } catch {
                              Alert.alert(t('common.error'), t('authErrors.generic'));
                            }
                          },
                        },
                      ]
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.walkRowIcon}>
                    <Ionicons name="walk" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.walkRowBody}>
                    <View style={styles.walkRowTitleRow}>
                      <Text style={styles.walkRowTitle}>
                        {w.durationMinutes} min
                        {w.distanceKm !== undefined ? ` · ${w.distanceKm.toFixed(2)} km` : ''}
                      </Text>
                      {w.trackedByGps && (
                        <Ionicons name="locate" size={12} color={colors.primary} />
                      )}
                    </View>
                    <Text style={styles.walkRowDate}>
                      {formatDate(w.startedAt.toDate(), i18n.language)}
                      {w.weather ? ` · ${t(`walks.weather.${w.weather}`)}` : ''}
                      {w.energy ? ` · ${t(`walks.energy.${w.energy}`)}` : ''}
                    </Text>
                    {w.notes && <Text style={styles.walkRowNotes} numberOfLines={2}>{w.notes}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={styles.hint}>{t('health.longPressHint')}</Text>
            </>
          )
        ) : activeTab === 'guides' ? (
          /* ── Guides tab ──────────────────────────────────────────────── */
          <>
            <Text style={styles.guidesIntro}>
              {matchedSet.size > 0
                ? t('guides.catalogSubtitle')
                : t('guides.noMatch')}
            </Text>
            {orderedGuides.map((g) => {
              const matched = matchedSet.has(g.id);
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[
                    styles.guideCard,
                    matched && { borderColor: g.color, borderWidth: 2 },
                  ]}
                  onPress={() => router.push(`/(shared)/behavior-guides/${g.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.guideIcon, { backgroundColor: g.color + '22' }]}>
                    <Text style={styles.guideEmoji}>{g.emoji}</Text>
                  </View>
                  <View style={styles.guideBody}>
                    <View style={styles.guideTitleRow}>
                      <Text style={styles.guideTitle} numberOfLines={1}>
                        {t(`guides.${g.id}.title`)}
                      </Text>
                      {matched && (
                        <View style={[styles.guideBadge, { backgroundColor: g.color }]}>
                          <Ionicons name="paw" size={10} color="#fff" />
                          <Text style={styles.guideBadgeText}>{t('guides.matchedBadge')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.guideSubtitle} numberOfLines={2}>
                      {t(`guides.${g.id}.subtitle`)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                </TouchableOpacity>
              );
            })}
            <Text style={styles.disclaimerSmall}>{t('guides.disclaimer')}</Text>
          </>
        ) : activeTab === 'weight' ? (
          /* ── Weight tab ──────────────────────────────────────────────── */
          weights.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons name="scale-outline" size={48} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t('weight.emptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('weight.emptySubtitle')}</Text>
            </View>
          ) : (
            <>
              {/* Latest summary */}
              <View style={styles.weightSummary}>
                <Text style={styles.weightSummaryLabel}>{t('weight.currentLabel')}</Text>
                <Text style={styles.weightSummaryValue}>
                  {sortedWeights[0].value.toFixed(1)} <Text style={styles.weightUnit}>kg</Text>
                </Text>
                <Text style={styles.weightSummaryDate}>
                  {formatDate(new Date(sortedWeights[0].date + 'T00:00:00'), i18n.language)}
                </Text>
              </View>

              {/* Chart */}
              <WeightChart entries={weights} maxBars={12} />

              {/* History */}
              <Text style={styles.historyTitle}>{t('weight.historyLabel')}</Text>
              {sortedWeights.map((w) => (
                <TouchableOpacity
                  key={w.date}
                  style={styles.weightRow}
                  onPress={() => openEditWeight(w)}
                  onLongPress={() => handleDeleteWeight(w)}
                  activeOpacity={0.7}
                >
                  <View style={styles.weightRowLeft}>
                    <Text style={styles.weightRowValue}>{w.value.toFixed(1)} kg</Text>
                    <Text style={styles.weightRowDate}>
                      {formatDate(new Date(w.date + 'T00:00:00'), i18n.language)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </TouchableOpacity>
              ))}
              <Text style={styles.hint}>{t('health.longPressHint')}</Text>
            </>
          )
        ) : loading ? (
          /* ── Reminders tab (loading) ────────────────────────────────── */
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.xxl }} />
        ) : reminders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="medkit-outline" size={48} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t('health.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('health.emptySubtitle')}</Text>
          </View>
        ) : (
          reminders.map((r) => {
            const due = r.dueAt.toDate();
            const days = daysUntil(due);
            const overdue = days < 0;
            const today = days === 0;
            const upcoming = days > 0 && days <= 7;
            const accent = TYPE_COLORS[r.type];
            const dueLabel = overdue
              ? t('health.overdue', { days: Math.abs(days) })
              : today
                ? t('health.today')
                : days === 1
                  ? t('health.tomorrow')
                  : days <= 7
                    ? t('health.inDays', { days })
                    : formatDate(due, i18n.language);

            return (
              <TouchableOpacity
                key={r.id}
                style={[
                  styles.reminderCard,
                  overdue && styles.reminderCardOverdue,
                  (today || upcoming) && styles.reminderCardSoon,
                ]}
                onPress={() => openEdit(r)}
                onLongPress={() => handleDelete(r)}
                activeOpacity={0.85}
              >
                <View style={[styles.reminderIcon, { backgroundColor: accent + '20' }]}>
                  <Ionicons name={TYPE_ICONS[r.type]} size={22} color={accent} />
                </View>
                <View style={styles.reminderBody}>
                  <Text style={styles.reminderTitle} numberOfLines={1}>{r.title}</Text>
                  <View style={styles.reminderMetaRow}>
                    <Text style={styles.reminderType}>{t(`health.type_${r.type}`)}</Text>
                    {r.recurrence !== 'none' && (
                      <>
                        <Text style={styles.reminderDot}>·</Text>
                        <Ionicons name="repeat" size={11} color={colors.textSecondary} />
                        <Text style={styles.reminderType}>{t(`health.recurrence_${r.recurrence}`)}</Text>
                      </>
                    )}
                  </View>
                  <Text style={[
                    styles.reminderDue,
                    overdue && styles.reminderDueOverdue,
                    (today || upcoming) && styles.reminderDueSoon,
                  ]}>
                    {dueLabel}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.completeBtn}
                  onPress={() => handleComplete(r)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('health.complete')}
                >
                  <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}

        {/* Footer hint */}
        {reminders.length > 0 && (
          <Text style={styles.hint}>{t('health.longPressHint')}</Text>
        )}
      </ScrollView>

      {/* FAB — context-sensitive based on active tab. Hidden on guides (read-only). */}
      {activeTab !== 'guides' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={
            activeTab === 'vet' ? () => { setEditingVet(null); setVetFormVisible(true); }
            : activeTab === 'walks' ? () => setWalkFormVisible(true)
            : activeTab === 'weight' ? openNewWeight
            : openNew
          }
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={
            activeTab === 'vet' ? t('vetRecords.addRecord')
            : activeTab === 'walks' ? t('walks.addWalk')
            : activeTab === 'weight' ? t('weight.addEntry')
            : t('health.addReminder')
          }
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Reminder form modal */}
      {formVisible && firebaseUser && dogId && (
        <ReminderFormModal
          visible={formVisible}
          existing={editing}
          userId={firebaseUser.uid}
          dogId={dogId}
          dogName={decodedName}
          locale={i18n.language}
          onClose={() => { setFormVisible(false); setEditing(null); }}
          onSaved={() => { setFormVisible(false); setEditing(null); load(); }}
        />
      )}

      {/* Weight form modal */}
      {weightFormVisible && dogId && (
        <WeightFormModal
          visible={weightFormVisible}
          existing={editingWeight}
          dogId={dogId}
          locale={i18n.language}
          onClose={() => { setWeightFormVisible(false); setEditingWeight(null); }}
          onSaved={() => { setWeightFormVisible(false); setEditingWeight(null); }}
        />
      )}

      {/* Walk form modal */}
      {walkFormVisible && dogId && firebaseUser && (
        <WalkFormModal
          visible={walkFormVisible}
          userId={firebaseUser.uid}
          dogId={dogId}
          locale={i18n.language}
          onClose={() => setWalkFormVisible(false)}
          onSaved={() => { setWalkFormVisible(false); loadWalks(); }}
        />
      )}

      {/* Vet record form modal */}
      {vetFormVisible && dogId && firebaseUser && (
        <VetRecordFormModal
          visible={vetFormVisible}
          existing={editingVet}
          userId={firebaseUser.uid}
          dogId={dogId}
          locale={i18n.language}
          onClose={() => { setVetFormVisible(false); setEditingVet(null); }}
          onSaved={() => { setVetFormVisible(false); setEditingVet(null); loadVetRecords(); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function FilterChip({ active, onPress, label, color }: { active: boolean; onPress: () => void; label: string; color: string }) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterChipText, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Walks week summary ─────────────────────────────────────────────────────

function WalksWeekSummary({ stats }: { stats: WeekStats }) {
  const { t } = useTranslation();
  return (
    <View style={styles.weekStatsCard}>
      <Text style={styles.weekStatsLabel}>{t('walks.thisWeek')}</Text>
      <View style={styles.weekStatsRow}>
        <View style={styles.weekStatItem}>
          <Text style={styles.weekStatValue}>{stats.totalWalks}</Text>
          <Text style={styles.weekStatKey}>{t('walks.statWalks')}</Text>
        </View>
        <View style={styles.weekStatItem}>
          <Text style={styles.weekStatValue}>{stats.totalMinutes}</Text>
          <Text style={styles.weekStatKey}>min</Text>
        </View>
        {stats.totalKm > 0 && (
          <View style={styles.weekStatItem}>
            <Text style={styles.weekStatValue}>{stats.totalKm.toFixed(1)}</Text>
            <Text style={styles.weekStatKey}>km</Text>
          </View>
        )}
        <View style={styles.weekStatItem}>
          <Text style={styles.weekStatValue}>{stats.daysActive}/7</Text>
          <Text style={styles.weekStatKey}>{t('walks.statDays')}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

function ReminderFormModal({
  visible,
  existing,
  userId,
  dogId,
  dogName,
  locale,
  onClose,
  onSaved,
}: {
  visible: boolean;
  existing: DogReminder | null;
  userId: string;
  dogId: string;
  dogName: string;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = existing !== null;

  const [type, setType] = useState<ReminderType>(existing?.type ?? 'vaccine');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [dueAt, setDueAt] = useState<Date>(
    existing?.dueAt.toDate() ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  );
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>(existing?.recurrence ?? 'none');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const titleValid = title.trim().length > 0;

  const handleSave = async () => {
    if (!titleValid) return;
    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateReminder(existing, { type, title, notes, dueAt, recurrence });
      } else {
        await createReminder({ userId, dogId, dogName, type, title, notes, dueAt, recurrence });
      }
      onSaved();
    } catch (err) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isEdit ? t('health.editReminder') : t('health.newReminder')}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={!titleValid || saving}>
              {saving ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[styles.saveText, !titleValid && styles.saveTextDisabled]}>
                  {t('common.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} showsVerticalScrollIndicator={false}>
            {/* Type selector */}
            <Text style={styles.fieldLabel}>{t('health.typeLabel')}</Text>
            <View style={styles.chipRow}>
              {TYPES.map((tt) => {
                const active = type === tt;
                const col = TYPE_COLORS[tt];
                return (
                  <TouchableOpacity
                    key={tt}
                    style={[
                      styles.typeChip,
                      active && { backgroundColor: col, borderColor: col },
                    ]}
                    onPress={() => setType(tt)}
                  >
                    <Ionicons
                      name={TYPE_ICONS[tt]}
                      size={16}
                      color={active ? '#fff' : col}
                    />
                    <Text style={[
                      styles.typeChipText,
                      active ? { color: '#fff' } : { color: colors.textSecondary },
                    ]}>
                      {t(`health.type_${tt}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Title */}
            <Text style={styles.fieldLabel}>{t('health.titleLabel')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('health.titlePlaceholder')}
              placeholderTextColor={colors.textLight}
              maxLength={80}
            />

            {/* Notes */}
            <Text style={styles.fieldLabel}>{t('health.notesLabel')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('health.notesPlaceholder')}
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              maxLength={500}
            />

            {/* Date picker */}
            <Text style={styles.fieldLabel}>{t('health.dueLabel')}</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.dateBtnText}>{formatDate(dueAt, locale)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={dueAt}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={(event, selected) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (event.type === 'set' && selected) setDueAt(selected);
                  if (event.type === 'dismissed') setShowDatePicker(false);
                }}
              />
            )}
            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.iosPickerDone}
              >
                <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
              </TouchableOpacity>
            )}

            {/* Recurrence */}
            <Text style={styles.fieldLabel}>{t('health.recurrenceLabel')}</Text>
            <View style={styles.chipRow}>
              {RECURRENCES.map((r) => {
                const active = recurrence === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.recChip, active && styles.recChipActive]}
                    onPress={() => setRecurrence(r)}
                  >
                    <Text style={[
                      styles.recChipText,
                      active && styles.recChipTextActive,
                    ]}>
                      {t(`health.recurrence_${r}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.helpText}>{t('health.notificationHelp')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Weight Form Modal ───────────────────────────────────────────────────────

function WeightFormModal({
  visible,
  existing,
  dogId,
  locale,
  onClose,
  onSaved,
}: {
  visible: boolean;
  existing: WeightEntry | null;
  dogId: string;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = existing !== null;

  const [valueStr, setValueStr] = useState(existing ? String(existing.value) : '');
  const [date, setDate] = useState<Date>(
    existing ? new Date(existing.date + 'T00:00:00') : new Date()
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Accept comma or dot as decimal separator
  const parsedValue = parseFloat(valueStr.replace(',', '.'));
  const valid = Number.isFinite(parsedValue) && parsedValue > 0 && parsedValue <= 200;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const isoDate = toISODate(date);
      await upsertWeight(dogId, parsedValue, isoDate);
      onSaved();
    } catch (err) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isEdit ? t('weight.editEntry') : t('weight.newEntry')}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={!valid || saving}>
              {saving ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[styles.saveText, !valid && styles.saveTextDisabled]}>
                  {t('common.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} showsVerticalScrollIndicator={false}>
            {/* Weight input */}
            <Text style={styles.fieldLabel}>{t('weight.valueLabel')}</Text>
            <View style={styles.weightInputRow}>
              <TextInput
                style={[styles.input, styles.weightInput]}
                value={valueStr}
                onChangeText={setValueStr}
                placeholder="12.5"
                placeholderTextColor={colors.textLight}
                keyboardType="decimal-pad"
                maxLength={6}
              />
              <Text style={styles.weightInputUnit}>kg</Text>
            </View>

            {/* Date picker */}
            <Text style={styles.fieldLabel}>{t('weight.dateLabel')}</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.dateBtnText}>{formatDate(date, locale)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(event, selected) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (event.type === 'set' && selected) setDate(selected);
                  if (event.type === 'dismissed') setShowDatePicker(false);
                }}
              />
            )}
            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.iosPickerDone}
              >
                <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.helpText}>{t('weight.help')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Vet Record Form Modal ──────────────────────────────────────────────────

function VetRecordFormModal({
  visible,
  existing,
  userId,
  dogId,
  locale,
  onClose,
  onSaved,
}: {
  visible: boolean;
  existing: VetRecord | null;
  userId: string;
  dogId: string;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = existing !== null;

  const [type, setType] = useState<VetRecordType>(existing?.type ?? 'vaccine');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState<Date>(existing?.date.toDate() ?? new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [vetName, setVetName] = useState(existing?.vetName ?? '');
  const [clinic, setClinic] = useState(existing?.clinic ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [productName, setProductName] = useState(existing?.productName ?? '');
  const [batchNumber, setBatchNumber] = useState(existing?.batchNumber ?? '');
  const [nextDueAt, setNextDueAt] = useState<Date | null>(existing?.nextDueAt?.toDate() ?? null);
  const [showNextDuePicker, setShowNextDuePicker] = useState(false);
  const [severity, setSeverity] = useState<VetSeverity | null>(existing?.severity ?? null);
  const [attachmentURL, setAttachmentURL] = useState<string | undefined>(existing?.attachmentURL);
  const [attachmentMime, setAttachmentMime] = useState<string | undefined>(existing?.attachmentMime);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const valid = title.trim().length > 0;

  // Conditional UI: which extra fields apply per record type
  const showProductFields = type === 'vaccine' || type === 'medication';
  const showSeverityField = type === 'allergy';
  const showNextDueField = type === 'vaccine' || type === 'medication' || type === 'visit';

  const handlePickAttachment = async () => {
    setUploading(true);
    try {
      const stamp = Date.now();
      const url = await pickAndUploadImage(`vet_documents/${userId}/${dogId}/${stamp}.jpg`);
      if (url) {
        setAttachmentURL(url);
        setAttachmentMime('image/jpeg');
      }
    } catch (err) {
      console.error('Upload error', err);
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateVetRecord(existing.id, {
          type, title, date, vetName, clinic, notes,
          productName: showProductFields ? productName : undefined,
          batchNumber: showProductFields ? batchNumber : undefined,
          nextDueAt: showNextDueField ? (nextDueAt ?? undefined) : undefined,
          severity: showSeverityField ? (severity ?? undefined) : undefined,
          attachmentURL,
          attachmentMime,
        });
      } else {
        await createVetRecord({
          userId, dogId, type, title, date, vetName, clinic, notes,
          productName: showProductFields ? productName : undefined,
          batchNumber: showProductFields ? batchNumber : undefined,
          nextDueAt: showNextDueField ? (nextDueAt ?? undefined) : undefined,
          severity: showSeverityField ? (severity ?? undefined) : undefined,
          attachmentURL,
          attachmentMime,
        });
      }
      onSaved();
    } catch (err) {
      console.error('Save vet record error', err);
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isEdit ? t('vetRecords.editRecord') : t('vetRecords.newRecord')}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={!valid || saving || uploading}>
              {saving ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[styles.saveText, (!valid || uploading) && styles.saveTextDisabled]}>
                  {t('common.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} showsVerticalScrollIndicator={false}>
            {/* Type */}
            <Text style={styles.fieldLabel}>{t('vetRecords.fields.type')}</Text>
            <View style={styles.chipRow}>
              {VET_RECORD_TYPES.map((tt) => {
                const active = type === tt;
                const col = VET_TYPE_COLORS[tt];
                return (
                  <TouchableOpacity
                    key={tt}
                    style={[styles.typeChip, active && { backgroundColor: col, borderColor: col }]}
                    onPress={() => setType(tt)}
                  >
                    <Ionicons name={VET_TYPE_ICONS[tt]} size={14} color={active ? '#fff' : col} />
                    <Text style={[
                      styles.typeChipText,
                      active ? { color: '#fff' } : { color: colors.textSecondary },
                    ]}>
                      {t(`vetRecords.types.${tt}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Title */}
            <Text style={styles.fieldLabel}>{t('vetRecords.fields.title')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('vetRecords.titlePlaceholder')}
              placeholderTextColor={colors.textLight}
              maxLength={120}
            />

            {/* Date */}
            <Text style={styles.fieldLabel}>{t('vetRecords.fields.date')}</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.dateBtnText}>{formatDate(date, locale)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(event, selected) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (event.type === 'set' && selected) setDate(selected);
                  if (event.type === 'dismissed') setShowDatePicker(false);
                }}
              />
            )}
            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.iosPickerDone}>
                <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
              </TouchableOpacity>
            )}

            {/* Vet name + clinic */}
            <Text style={styles.fieldLabel}>{t('vetRecords.fields.vetName')}</Text>
            <TextInput
              style={styles.input}
              value={vetName}
              onChangeText={setVetName}
              placeholder={t('vetRecords.vetNamePlaceholder')}
              placeholderTextColor={colors.textLight}
              maxLength={80}
            />
            <Text style={styles.fieldLabel}>{t('vetRecords.fields.clinic')}</Text>
            <TextInput
              style={styles.input}
              value={clinic}
              onChangeText={setClinic}
              placeholder={t('vetRecords.clinicPlaceholder')}
              placeholderTextColor={colors.textLight}
              maxLength={120}
            />

            {/* Conditional: product + batch (vaccines, medications) */}
            {showProductFields && (
              <>
                <Text style={styles.fieldLabel}>{t('vetRecords.fields.productName')}</Text>
                <TextInput
                  style={styles.input}
                  value={productName}
                  onChangeText={setProductName}
                  placeholder={t('vetRecords.productPlaceholder')}
                  placeholderTextColor={colors.textLight}
                  maxLength={120}
                />
                <Text style={styles.fieldLabel}>{t('vetRecords.fields.batchNumber')}</Text>
                <TextInput
                  style={styles.input}
                  value={batchNumber}
                  onChangeText={setBatchNumber}
                  placeholder="ABC123"
                  placeholderTextColor={colors.textLight}
                  maxLength={60}
                />
              </>
            )}

            {/* Conditional: severity (allergy) */}
            {showSeverityField && (
              <>
                <Text style={styles.fieldLabel}>{t('vetRecords.fields.severity')}</Text>
                <View style={styles.chipRow}>
                  {VET_SEVERITIES.map((s) => {
                    const active = severity === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.recChip, active && styles.recChipActive]}
                        onPress={() => setSeverity(active ? null : s)}
                      >
                        <Text style={[styles.recChipText, active && styles.recChipTextActive]}>
                          {t(`vetRecords.severity.${s}`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Conditional: next due (follow-up reminder) */}
            {showNextDueField && (
              <>
                <Text style={styles.fieldLabel}>{t('vetRecords.fields.nextDueAt')}</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowNextDuePicker(true)} activeOpacity={0.8}>
                  <Ionicons name="alarm-outline" size={20} color={colors.primary} />
                  <Text style={styles.dateBtnText}>
                    {nextDueAt ? formatDate(nextDueAt, locale) : t('vetRecords.noNextDue')}
                  </Text>
                  {nextDueAt && (
                    <TouchableOpacity onPress={() => setNextDueAt(null)} hitSlop={8} style={{ marginLeft: 'auto' }}>
                      <Ionicons name="close-circle" size={18} color={colors.textLight} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
                {showNextDuePicker && (
                  <DateTimePicker
                    value={nextDueAt ?? new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    minimumDate={new Date()}
                    onChange={(event, selected) => {
                      if (Platform.OS !== 'ios') setShowNextDuePicker(false);
                      if (event.type === 'set' && selected) setNextDueAt(selected);
                      if (event.type === 'dismissed') setShowNextDuePicker(false);
                    }}
                  />
                )}
                {Platform.OS === 'ios' && showNextDuePicker && (
                  <TouchableOpacity onPress={() => setShowNextDuePicker(false)} style={styles.iosPickerDone}>
                    <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Notes */}
            <Text style={styles.fieldLabel}>{t('vetRecords.fields.notes')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('vetRecords.notesPlaceholder')}
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              maxLength={1000}
            />

            {/* Attachment */}
            <Text style={styles.fieldLabel}>{t('vetRecords.fields.attachment')}</Text>
            <TouchableOpacity
              style={styles.attachmentBtn}
              onPress={handlePickAttachment}
              disabled={uploading}
              activeOpacity={0.7}
            >
              {uploading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : attachmentURL ? (
                <>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  <Text style={styles.attachmentBtnText}>{t('vetRecords.attachmentReplace')}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
                  <Text style={styles.attachmentBtnText}>{t('vetRecords.attachmentUpload')}</Text>
                </>
              )}
            </TouchableOpacity>
            {attachmentURL && (
              <TouchableOpacity
                onPress={() => { setAttachmentURL(undefined); setAttachmentMime(undefined); }}
                style={{ alignSelf: 'flex-end', marginTop: 4 }}
              >
                <Text style={{ color: colors.error, fontSize: fontSize.xs, fontWeight: '700' }}>
                  {t('vetRecords.attachmentRemove')}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.helpText}>{t('vetRecords.help')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Walk Form Modal ────────────────────────────────────────────────────────

const WALK_DURATIONS = [10, 15, 20, 30, 45, 60, 90];
const WALK_WEATHERS: WalkWeather[] = ['sunny', 'cloudy', 'rainy', 'snowy', 'cold', 'hot'];
const WALK_ENERGIES: WalkEnergy[] = ['low', 'medium', 'high'];

const WEATHER_EMOJIS: Record<WalkWeather, string> = {
  sunny: '☀️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️', cold: '🥶', hot: '🥵',
};

function WalkFormModal({
  visible,
  userId,
  dogId,
  locale,
  onClose,
  onSaved,
}: {
  visible: boolean;
  userId: string;
  dogId: string;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();

  const [duration, setDuration] = useState<number>(20);
  const [distanceStr, setDistanceStr] = useState<string>('');
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [weather, setWeather] = useState<WalkWeather | null>(null);
  const [energy, setEnergy] = useState<WalkEnergy | null>('medium');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const parsedDistance = parseFloat(distanceStr.replace(',', '.'));
  const distanceValid = distanceStr === '' || (Number.isFinite(parsedDistance) && parsedDistance >= 0 && parsedDistance <= 100);
  const valid = duration > 0 && distanceValid;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await createWalk({
        userId,
        dogId,
        startedAt: date,
        durationMinutes: duration,
        distanceKm: distanceStr ? parsedDistance : undefined,
        weather: weather ?? undefined,
        energy: energy ?? undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      onSaved();
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('walks.newWalk')}</Text>
            <TouchableOpacity onPress={handleSave} disabled={!valid || saving}>
              {saving ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[styles.saveText, !valid && styles.saveTextDisabled]}>
                  {t('common.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} showsVerticalScrollIndicator={false}>
            {/* Duration chips + manual input */}
            <Text style={styles.fieldLabel}>{t('walks.duration')}</Text>
            <View style={styles.chipRow}>
              {WALK_DURATIONS.map((d) => {
                const active = duration === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.recChip, active && styles.recChipActive]}
                    onPress={() => setDuration(d)}
                  >
                    <Text style={[styles.recChipText, active && styles.recChipTextActive]}>
                      {d} min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Distance (optional) */}
            <Text style={styles.fieldLabel}>{t('walks.distance')}</Text>
            <View style={styles.weightInputRow}>
              <TextInput
                style={[styles.input, styles.weightInput]}
                value={distanceStr}
                onChangeText={setDistanceStr}
                placeholder="0.0"
                placeholderTextColor={colors.textLight}
                keyboardType="decimal-pad"
                maxLength={5}
              />
              <Text style={styles.weightInputUnit}>km</Text>
            </View>

            {/* Date */}
            <Text style={styles.fieldLabel}>{t('walks.date')}</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.dateBtnText}>{formatDate(date, locale)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(event, selected) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (event.type === 'set' && selected) setDate(selected);
                  if (event.type === 'dismissed') setShowDatePicker(false);
                }}
              />
            )}
            {Platform.OS === 'ios' && showDatePicker && (
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.iosPickerDone}>
                <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
              </TouchableOpacity>
            )}

            {/* Weather */}
            <Text style={styles.fieldLabel}>{t('walks.weatherLabel')}</Text>
            <View style={styles.chipRow}>
              {WALK_WEATHERS.map((w) => {
                const active = weather === w;
                return (
                  <TouchableOpacity
                    key={w}
                    style={[styles.recChip, active && styles.recChipActive]}
                    onPress={() => setWeather(active ? null : w)}
                  >
                    <Text style={[styles.recChipText, active && styles.recChipTextActive]}>
                      {WEATHER_EMOJIS[w]} {t(`walks.weather.${w}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Energy */}
            <Text style={styles.fieldLabel}>{t('walks.energyLabel')}</Text>
            <View style={styles.chipRow}>
              {WALK_ENERGIES.map((e) => {
                const active = energy === e;
                return (
                  <TouchableOpacity
                    key={e}
                    style={[styles.recChip, active && styles.recChipActive]}
                    onPress={() => setEnergy(active ? null : e)}
                  >
                    <Text style={[styles.recChipText, active && styles.recChipTextActive]}>
                      {t(`walks.energy.${e}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Notes */}
            <Text style={styles.fieldLabel}>{t('walks.notesLabel')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('walks.notesPlaceholder')}
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={2}
              maxLength={280}
            />

            <Text style={styles.helpText}>{t('walks.help')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },

  // Empty
  emptyContainer: { alignItems: 'center', padding: spacing.xl, gap: spacing.md, marginTop: spacing.xxl },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  // Reminder card
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  reminderCardOverdue: { borderColor: colors.error + '60', backgroundColor: colors.error + '08' },
  reminderCardSoon: { borderColor: colors.primary + '60' },
  reminderIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  reminderBody: { flex: 1, gap: 2 },
  reminderTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  reminderMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reminderType: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  reminderDot: { fontSize: fontSize.xs, color: colors.textLight },
  reminderDue: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  reminderDueOverdue: { color: colors.error, fontWeight: '700' },
  reminderDueSoon: { color: colors.primary, fontWeight: '700' },
  completeBtn: { padding: 4 },

  hint: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
  },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: spacing.lg,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  cancelText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600' },
  saveText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700' },
  saveTextDisabled: { color: colors.textLight },

  // Form
  formBody: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.text,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeChipText: { fontSize: fontSize.sm, fontWeight: '600' },
  recChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  recChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  recChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  recChipTextActive: { color: '#fff', fontWeight: '700' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateBtnText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  iosPickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iosPickerDoneText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.md },
  helpText: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.md,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  // Tabs (Reminders / Weight)
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  bannersRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  bannerSmall: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  bannerWeekly: {
    backgroundColor: colors.primary + '12',
    borderColor: colors.primary + '30',
  },
  bannerChallenges: {
    backgroundColor: '#9B51E012',
    borderColor: '#9B51E030',
  },
  bannerSmallTitle: { fontSize: fontSize.xs, fontWeight: '800', color: colors.text, flex: 1 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textLight },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  // Weight summary card
  weightSummary: {
    backgroundColor: colors.primary + '12',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  weightSummaryLabel: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weightSummaryValue: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  weightUnit: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  weightSummaryDate: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  // Weight history
  historyTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weightRowLeft: { gap: 2 },
  weightRowValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  weightRowDate: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  // Weight input
  weightInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weightInput: { flex: 1, fontSize: fontSize.xxl, fontWeight: '800', textAlign: 'center' },
  weightInputUnit: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textSecondary },
  // Guides tab
  guidesIntro: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  guideIcon: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  guideEmoji: { fontSize: 24 },
  guideBody: { flex: 1, gap: 2 },
  guideTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  guideTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, flexShrink: 1 },
  guideBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.full,
  },
  guideBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  guideSubtitle: { fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 16 },
  disclaimerSmall: {
    fontSize: 11,
    color: colors.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  // Walks tab — week summary card
  weekStatsCard: {
    backgroundColor: colors.primary + '12',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    gap: spacing.sm,
  },
  weekStatsLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  weekStatItem: { alignItems: 'center', flex: 1, minWidth: 60 },
  weekStatValue: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  weekStatKey: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Walks tab — list rows
  walkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walkRowIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  walkRowBody: { flex: 1, gap: 2 },
  walkRowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walkRowTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  gpsTrackerCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginVertical: spacing.md,
  },
  gpsTrackerCtaText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.md },
  walkRowDate: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  walkRowNotes: { fontSize: fontSize.xs, color: colors.textLight, marginTop: 4, fontStyle: 'italic' },

  // Vet records tab
  vetFilterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterChipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },

  vetExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '12',
    borderColor: colors.primary + '40',
    borderWidth: 1.5,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginVertical: spacing.sm,
  },
  vetExportBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '800' },

  vetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vetRowIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  vetRowBody: { flex: 1, gap: 4 },
  vetRowTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  vetRowTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, flex: 1 },
  vetTypeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.full },
  vetTypeTagText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  vetRowDate: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  vetRowNotes: { fontSize: fontSize.xs, color: colors.textLight, fontStyle: 'italic', marginTop: 2 },
  vetAttachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginTop: 4,
  },
  vetAttachmentText: { fontSize: 10, color: colors.primary, fontWeight: '700' },

  attachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  attachmentBtnText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },
});
