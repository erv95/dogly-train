import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  RefreshControl,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  searchTrainers,
  TrainerSearchResult,
  TrainerFilters,
  DEFAULT_FILTERS,
} from '../../src/services/trainers';
import {
  searchCaretakers,
  CaretakerSearchResult,
  CaretakerFilters,
  DEFAULT_CARETAKER_FILTERS,
  getMinPrice,
} from '../../src/services/caretakers';
import { CaretakerService, Dog } from '../../src/types';
import { Avatar, StarRating } from '../../src/components/ui';
import { TrainerCardSkeleton } from '../../src/components/skeletons';
import { CoinBalancePill } from '../../src/components/CoinBalancePill';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import { useAuth } from '../../src/contexts/AuthContext';
import { getDogsByOwner } from '../../src/services/dogs';
import DailyTipsRail from '../../src/components/DailyTipsRail';
import { colors, spacing, fontSize, borderRadius, shadow, fontFamily } from '../../src/theme';
import { isBoostActive } from '../../src/utils/boost';

const RADIUS_OPTIONS = [10, 25, 50, 100, 200];
const RATING_OPTIONS = [0, 3, 3.5, 4, 4.5];
const MAX_PRICE_OPTIONS = [0, 20, 40, 60, 100];

const ALL_CARETAKER_SERVICES: CaretakerService[] = ['walks', 'day_care', 'overnight', 'home_care'];

const CARETAKER_SERVICE_LABEL_KEY: Record<CaretakerService, string> = {
  walks: 'caretaker.serviceWalks',
  day_care: 'caretaker.serviceDayCare',
  overnight: 'caretaker.serviceOvernight',
  home_care: 'caretaker.serviceHomeCare',
};

type ActiveTab = 'trainers' | 'caretakers';

export default function OwnerHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();

  // Active tab (trainers vs caretakers)
  const [activeTab, setActiveTab] = useState<ActiveTab>('trainers');

  // User's dogs (for the daily-tips rail)
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);

  const [trainers, setTrainers] = useState<TrainerSearchResult[]>([]);
  const [caretakers, setCaretakers] = useState<CaretakerSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState(false);

  // Filters per tab (kept independent so they don't bleed into each other)
  const [filters, setFilters] = useState<TrainerFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<TrainerFilters>(DEFAULT_FILTERS);
  const [caretakerFilters, setCaretakerFilters] = useState<CaretakerFilters>(DEFAULT_CARETAKER_FILTERS);
  const [draftCaretakerFilters, setDraftCaretakerFilters] = useState<CaretakerFilters>(DEFAULT_CARETAKER_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFiltersCount = activeTab === 'trainers'
    ? (filters.radiusKm > 0 ? 1 : 0) +
      (filters.minRating > 0 ? 1 : 0) +
      (filters.maxPrice > 0 ? 1 : 0) +
      (filters.specialty ? 1 : 0) +
      (filters.verifiedOnly ? 1 : 0)
    : (caretakerFilters.radiusKm > 0 ? 1 : 0) +
      (caretakerFilters.minRating > 0 ? 1 : 0) +
      (caretakerFilters.maxPrice > 0 ? 1 : 0) +
      (caretakerFilters.service ? 1 : 0) +
      (caretakerFilters.verifiedOnly ? 1 : 0);

  // ── Location ─────────────────────────────────────────────────────────────────

  const getLocation = useCallback(async (): Promise<[number, number] | null> => {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      setLocationError(true);
      if (!canAskAgain) {
        // Permission permanently denied — guide to Settings
        // (handled in renderEmpty)
      }
      setLoading(false);
      return null;
    }

    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords: [number, number] = [loc.coords.latitude, loc.coords.longitude];
      setUserLocation(coords);
      setLocationError(false);
      return coords;
    } catch {
      setLocationError(true);
      setLoading(false);
      return null;
    }
  }, []);

  // ── Load trainers ─────────────────────────────────────────────────────────────

  const loadTrainers = useCallback(async (coords: [number, number] | null, f: TrainerFilters) => {
    try {
      const results = await searchTrainers(coords, f);
      setTrainers(results);
    } catch (error) {
      console.error('Error searching trainers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadCaretakers = useCallback(async (coords: [number, number] | null, f: CaretakerFilters) => {
    try {
      const results = await searchCaretakers(coords, f);
      setCaretakers(results);
    } catch (error) {
      console.error('Error searching caretakers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load whichever tab is active (re-runs on tab switch)
  const reload = useCallback((coords: [number, number] | null) => {
    setLoading(true);
    if (activeTab === 'trainers') {
      loadTrainers(coords, filters);
    } else {
      loadCaretakers(coords, caretakerFilters);
    }
  }, [activeTab, filters, caretakerFilters, loadTrainers, loadCaretakers]);

  useEffect(() => {
    (async () => {
      const coords = await getLocation();
      // Initial load: trainers tab
      loadTrainers(coords, filters);
    })();
  }, []);

  // Load user's dogs in parallel for the daily-tips rail
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    let cancelled = false;
    getDogsByOwner(firebaseUser.uid)
      .then((list) => {
        if (cancelled) return;
        setDogs(list);
        if (list.length > 0 && !selectedDogId) setSelectedDogId(list[0].id);
      })
      .catch(() => { /* silent: rail just won't show */ });
    return () => { cancelled = true; };
  }, [firebaseUser?.uid]);

  // Track first run to avoid double-load on mount.
  // We intentionally only depend on activeTab here: re-running on filter changes
  // would interfere with the filter modal's "apply" flow that already triggers
  // its own load.
  const isFirstTabRun = useRef(true);
  useEffect(() => {
    if (isFirstTabRun.current) {
      isFirstTabRun.current = false;
      return;
    }
    // On actual tab switch, load that tab's data
    reload(userLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const coords = await getLocation();
    reload(coords ?? userLocation);
  };

  const applyFilters = () => {
    setFiltersOpen(false);
    setLoading(true);
    if (activeTab === 'trainers') {
      setFilters(draftFilters);
      loadTrainers(userLocation, draftFilters);
    } else {
      setCaretakerFilters(draftCaretakerFilters);
      loadCaretakers(userLocation, draftCaretakerFilters);
    }
  };

  const resetFilters = () => {
    setFiltersOpen(false);
    setLoading(true);
    if (activeTab === 'trainers') {
      setDraftFilters(DEFAULT_FILTERS);
      setFilters(DEFAULT_FILTERS);
      loadTrainers(userLocation, DEFAULT_FILTERS);
    } else {
      setDraftCaretakerFilters(DEFAULT_CARETAKER_FILTERS);
      setCaretakerFilters(DEFAULT_CARETAKER_FILTERS);
      loadCaretakers(userLocation, DEFAULT_CARETAKER_FILTERS);
    }
  };

  // ── Trainer card ──────────────────────────────────────────────────────────────

  const renderTrainerCard = ({ item }: { item: TrainerSearchResult }) => {
    const isBoosted = isBoostActive(item.boostedUntil as any);
    const hasLocation = item.distanceKm > 0 || item.city;
    const currency = item.currency === 'EUR' ? '€' : item.currency === 'USD' ? '$' : item.currency;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push(`/(shared)/trainer/${item.id}`)}
      >
        <View style={[styles.card, isBoosted && styles.boostedCard]}>
          {isBoosted && (
            <View style={styles.boostBanner}>
              <Ionicons name="flash" size={12} color="#92400E" />
              <Text style={styles.boostText}>{t('owner.featured')}</Text>
            </View>
          )}

          <View style={styles.cardMain}>
            <Avatar uri={item.photoURL} name={item.displayName} size={60} />

            <View style={styles.cardInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.trainerName} numberOfLines={1}>{item.displayName}</Text>
                <VerifiedBadge visible={(item as any).verified === true} size="sm" showLabel={false} />
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                {hasLocation && (
                  <View style={styles.statItem}>
                    <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.statText}>
                      {item.city ? item.city : ''}{item.distanceKm > 0 ? ` · ${item.distanceKm.toFixed(1)} ${t('owner.distanceLabel')}` : ''}
                    </Text>
                  </View>
                )}
                {item.experience ? (
                  <View style={styles.statItem}>
                    <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.statText}>{item.experience} {t('owner.experienceYears')}</Text>
                  </View>
                ) : null}
              </View>

              {/* Rating */}
              <View style={styles.ratingRow}>
                <StarRating rating={item.averageRating} size={13} />
                <Text style={styles.ratingText}>
                  {item.averageRating > 0 ? item.averageRating.toFixed(1) : '—'}
                  {item.totalReviews > 0 ? ` (${item.totalReviews})` : ''}
                </Text>
              </View>
            </View>

            {/* Price column */}
            <View style={styles.priceCol}>
              <Text style={styles.priceValue}>
                {item.pricePerSession > 0 ? `${item.pricePerSession}${currency}` : '—'}
              </Text>
              <Text style={styles.priceLabel}>{t('owner.perSession')}</Text>
            </View>
          </View>

          {/* Specialties */}
          {item.specialties.length > 0 && (
            <View style={styles.specialties}>
              {item.specialties.slice(0, 3).map((s, i) => (
                <View key={i} style={styles.specialtyTag}>
                  <Text style={styles.specialtyText}>{s}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Caretaker card ────────────────────────────────────────────────────────────

  const renderCaretakerCard = ({ item }: { item: CaretakerSearchResult }) => {
    const isBoosted = isBoostActive(item.boostedUntil as any);
    const hasLocation = item.distanceKm > 0 || item.city;
    const currency = item.currency === 'EUR' ? '€' : item.currency === 'USD' ? '$' : item.currency;
    const isBusiness = item.accountType === 'business';
    const displayTitle = isBusiness && item.businessName ? item.businessName : item.displayName;
    const minPrice = getMinPrice(item);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push(`/(shared)/caretaker/${item.id}`)}
      >
        <View style={[styles.card, isBoosted && styles.boostedCard]}>
          {isBoosted && (
            <View style={styles.boostBanner}>
              <Ionicons name="flash" size={12} color="#92400E" />
              <Text style={styles.boostText}>{t('owner.featured')}</Text>
            </View>
          )}

          <View style={styles.cardMain}>
            <Avatar uri={item.photoURL} name={displayTitle} size={60} />

            <View style={styles.cardInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.trainerName} numberOfLines={1}>{displayTitle}</Text>
                {isBusiness && (
                  <Ionicons name="business" size={14} color={colors.secondary} />
                )}
                <VerifiedBadge visible={(item as any).verified === true} size="sm" showLabel={false} />
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                {hasLocation && (
                  <View style={styles.statItem}>
                    <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.statText}>
                      {item.city ? item.city : ''}{item.distanceKm > 0 ? ` · ${item.distanceKm.toFixed(1)} ${t('owner.distanceLabel')}` : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Rating */}
              <View style={styles.ratingRow}>
                <StarRating rating={item.averageRating} size={13} />
                <Text style={styles.ratingText}>
                  {item.averageRating > 0 ? item.averageRating.toFixed(1) : '—'}
                  {item.totalReviews > 0 ? ` (${item.totalReviews})` : ''}
                </Text>
              </View>
            </View>

            {/* Price column */}
            <View style={styles.priceCol}>
              {minPrice > 0 ? (
                <>
                  <Text style={styles.priceValue}>{minPrice}{currency}</Text>
                  <Text style={styles.priceLabel}>{t('owner.fromLabel')}</Text>
                </>
              ) : (
                <Text style={styles.priceValue}>—</Text>
              )}
            </View>
          </View>

          {/* Service chips */}
          {item.services.length > 0 && (
            <View style={styles.specialties}>
              {item.services.slice(0, 4).map((s) => (
                <View key={s} style={styles.specialtyTag}>
                  <Text style={styles.specialtyText}>{t(CARETAKER_SERVICE_LABEL_KEY[s])}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Empty state ───────────────────────────────────────────────────────────────

  const renderEmpty = () => {
    if (loading) return null;

    if (locationError) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={56} color={colors.textLight} />
          <Text style={styles.emptyTitle}>{t('owner.locationPermissionTitle')}</Text>
          <Text style={styles.emptyText}>{t('owner.locationPermissionMsg')}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={async () => {
              const { canAskAgain } = await Location.getForegroundPermissionsAsync();
              if (!canAskAgain) {
                Linking.openSettings();
              } else {
                setLoading(true);
                const coords = await getLocation();
                reload(coords);
              }
            }}
          >
            <Text style={styles.retryBtnText}>{t('owner.openSettings')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search-outline" size={56} color={colors.textLight} />
        <Text style={styles.emptyTitle}>{t('common.noResults')}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={resetFilters}>
          <Text style={styles.retryBtnText}>{t('owner.filterReset')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Filter modal ──────────────────────────────────────────────────────────────

  const renderFilterModal = () => (
    <Modal
      visible={filtersOpen}
      animationType="slide"
      transparent
      onRequestClose={() => setFiltersOpen(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.filterSheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('owner.filters')}</Text>
            <TouchableOpacity onPress={() => setFiltersOpen(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>

            {activeTab === 'trainers' ? (
              <>
                {/* Distance */}
                <Text style={styles.filterLabel}>{t('owner.filterDistance')}</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, draftFilters.radiusKm === 0 && styles.chipActive]}
                    onPress={() => setDraftFilters(f => ({ ...f, radiusKm: 0 }))}
                  >
                    <Text style={[styles.chipText, draftFilters.radiusKm === 0 && styles.chipTextActive]}>
                      {t('owner.filterAny')}
                    </Text>
                  </TouchableOpacity>
                  {RADIUS_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, draftFilters.radiusKm === r && styles.chipActive]}
                      onPress={() => setDraftFilters(f => ({ ...f, radiusKm: r }))}
                    >
                      <Text style={[styles.chipText, draftFilters.radiusKm === r && styles.chipTextActive]}>
                        {r} km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Min rating */}
                <Text style={styles.filterLabel}>{t('owner.filterMinRating')}</Text>
                <View style={styles.chipRow}>
                  {RATING_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, draftFilters.minRating === r && styles.chipActive]}
                      onPress={() => setDraftFilters(f => ({ ...f, minRating: r }))}
                    >
                      <Text style={[styles.chipText, draftFilters.minRating === r && styles.chipTextActive]}>
                        {r === 0 ? t('owner.filterAny') : `${r}★`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Max price */}
                <Text style={styles.filterLabel}>{t('owner.filterMaxPrice')}</Text>
                <View style={styles.chipRow}>
                  {MAX_PRICE_OPTIONS.map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, draftFilters.maxPrice === p && styles.chipActive]}
                      onPress={() => setDraftFilters(f => ({ ...f, maxPrice: p }))}
                    >
                      <Text style={[styles.chipText, draftFilters.maxPrice === p && styles.chipTextActive]}>
                        {p === 0 ? t('owner.filterAny') : `≤${p}€`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                {/* Caretaker filters */}
                <Text style={styles.filterLabel}>{t('owner.filterDistance')}</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, draftCaretakerFilters.radiusKm === 0 && styles.chipActive]}
                    onPress={() => setDraftCaretakerFilters(f => ({ ...f, radiusKm: 0 }))}
                  >
                    <Text style={[styles.chipText, draftCaretakerFilters.radiusKm === 0 && styles.chipTextActive]}>
                      {t('owner.filterAny')}
                    </Text>
                  </TouchableOpacity>
                  {RADIUS_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, draftCaretakerFilters.radiusKm === r && styles.chipActive]}
                      onPress={() => setDraftCaretakerFilters(f => ({ ...f, radiusKm: r }))}
                    >
                      <Text style={[styles.chipText, draftCaretakerFilters.radiusKm === r && styles.chipTextActive]}>
                        {r} km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.filterLabel}>{t('owner.filterMinRating')}</Text>
                <View style={styles.chipRow}>
                  {RATING_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, draftCaretakerFilters.minRating === r && styles.chipActive]}
                      onPress={() => setDraftCaretakerFilters(f => ({ ...f, minRating: r }))}
                    >
                      <Text style={[styles.chipText, draftCaretakerFilters.minRating === r && styles.chipTextActive]}>
                        {r === 0 ? t('owner.filterAny') : `${r}★`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.filterLabel}>{t('owner.filterMaxPrice')}</Text>
                <View style={styles.chipRow}>
                  {MAX_PRICE_OPTIONS.map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, draftCaretakerFilters.maxPrice === p && styles.chipActive]}
                      onPress={() => setDraftCaretakerFilters(f => ({ ...f, maxPrice: p }))}
                    >
                      <Text style={[styles.chipText, draftCaretakerFilters.maxPrice === p && styles.chipTextActive]}>
                        {p === 0 ? t('owner.filterAny') : `≤${p}€`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Service filter */}
                <Text style={styles.filterLabel}>{t('caretaker.filterByService')}</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, draftCaretakerFilters.service === '' && styles.chipActive]}
                    onPress={() => setDraftCaretakerFilters(f => ({ ...f, service: '' }))}
                  >
                    <Text style={[styles.chipText, draftCaretakerFilters.service === '' && styles.chipTextActive]}>
                      {t('owner.filterAny')}
                    </Text>
                  </TouchableOpacity>
                  {ALL_CARETAKER_SERVICES.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chip, draftCaretakerFilters.service === s && styles.chipActive]}
                      onPress={() => setDraftCaretakerFilters(f => ({ ...f, service: s }))}
                    >
                      <Text style={[styles.chipText, draftCaretakerFilters.service === s && styles.chipTextActive]}>
                        {t(CARETAKER_SERVICE_LABEL_KEY[s])}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Verified-only toggle — applies to both tabs */}
            <Text style={styles.filterLabel}>{t('identityVerification.filterTitle')}</Text>
            <TouchableOpacity
              style={styles.verifiedToggleRow}
              onPress={() => {
                if (activeTab === 'trainers') {
                  setDraftFilters(f => ({ ...f, verifiedOnly: !f.verifiedOnly }));
                } else {
                  setDraftCaretakerFilters(f => ({ ...f, verifiedOnly: !f.verifiedOnly }));
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name="shield-checkmark"
                size={18}
                color={
                  (activeTab === 'trainers' ? draftFilters.verifiedOnly : draftCaretakerFilters.verifiedOnly)
                    ? '#2D9CDB'
                    : colors.textLight
                }
              />
              <Text style={styles.verifiedToggleText}>
                {t('identityVerification.filterVerifiedOnly')}
              </Text>
              <View style={[
                styles.verifiedToggleSwitch,
                (activeTab === 'trainers' ? draftFilters.verifiedOnly : draftCaretakerFilters.verifiedOnly)
                  && styles.verifiedToggleSwitchOn,
              ]}>
                <View style={[
                  styles.verifiedToggleKnob,
                  (activeTab === 'trainers' ? draftFilters.verifiedOnly : draftCaretakerFilters.verifiedOnly)
                    && styles.verifiedToggleKnobOn,
                ]} />
              </View>
            </TouchableOpacity>
          </ScrollView>

          {/* Actions */}
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
              <Text style={styles.resetBtnText}>{t('owner.filterReset')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
              <Text style={styles.applyBtnText}>{t('owner.filterApply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  const headerTitle = t('owner.home');
  const currentList = activeTab === 'trainers' ? trainers : caretakers;
  const renderItem = activeTab === 'trainers' ? renderTrainerCard : renderCaretakerCard;

  const openFilters = () => {
    if (activeTab === 'trainers') {
      setDraftFilters(filters);
    } else {
      setDraftCaretakerFilters(caretakerFilters);
    }
    setFiltersOpen(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {/* SOS — emergency shortcut, always visible */}
        <TouchableOpacity
          style={styles.sosBtn}
          onPress={() => router.push('/(shared)/emergency')}
          accessibilityRole="button"
          accessibilityLabel={t('emergency.title')}
          activeOpacity={0.85}
        >
          <Ionicons name="warning" size={18} color="#fff" />
          <Text style={styles.sosBtnText}>SOS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => router.push('/(shared)/places')}
          accessibilityRole="button"
          accessibilityLabel={t('places.title')}
        >
          <Ionicons name="map-outline" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{headerTitle}</Text>
        <CoinBalancePill style={{ marginRight: spacing.xs }} />
        <TouchableOpacity
          style={[styles.filterBtn, activeFiltersCount > 0 && styles.filterBtnActive]}
          onPress={openFilters}
          accessibilityRole="button"
          accessibilityLabel={t('owner.filters')}
        >
          <Ionicons name="options-outline" size={20} color={activeFiltersCount > 0 ? colors.textOnPrimary : colors.text} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Plan de hoy — fixed below header, visible on both tabs */}
      {selectedDogId && dogs.length > 0 && (
        <DailyTipsRail
          dog={dogs.find((d) => d.id === selectedDogId) ?? dogs[0]}
          otherDogs={dogs.filter((d) => d.id !== selectedDogId)}
          onChangeDog={setSelectedDogId}
        />
      )}

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'trainers' && styles.tabActive]}
          onPress={() => setActiveTab('trainers')}
          activeOpacity={0.7}
        >
          <Ionicons name="school" size={18} color={activeTab === 'trainers' ? '#fff' : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'trainers' && styles.tabTextActive]}>
            {t('auth.trainer')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'caretakers' && styles.tabActive]}
          onPress={() => setActiveTab('caretakers')}
          activeOpacity={0.7}
        >
          <Ionicons name="home" size={18} color={activeTab === 'caretakers' ? '#fff' : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'caretakers' && styles.tabTextActive]}>
            {t('auth.caretaker')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Count */}
      {!loading && (
        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>{t('owner.yourResults')}</Text>
          <View style={styles.resultBadge}>
            <Text style={styles.resultBadgeText}>{currentList.length}</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.list}>
          <TrainerCardSkeleton count={5} />
        </View>
      ) : (
        <FlatList
          data={currentList as any[]}
          keyExtractor={(item) => item.id}
          renderItem={renderItem as any}
          contentContainerStyle={currentList.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
          }
        />
      )}

      {renderFilterModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerSpacer: { width: 40 },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.error,
  },
  sosBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: spacing.xs,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.error,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  resultLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fontFamily.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
  },
  resultBadge: {
    minWidth: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '15',
    borderWidth: 1,
    borderColor: colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBadgeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  // Tabs — pill-style active state with smooth visual contrast
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
    fontFamily: fontFamily.bold,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  emptyList: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Card
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    ...shadow.sm,
  },
  boostedCard: {
    borderWidth: 1.5,
    borderColor: colors.boost + '80',
    backgroundColor: '#FFFBEB',
  },
  boostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
    backgroundColor: colors.boost + '25',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  boostText: { fontSize: fontSize.xs, fontWeight: '700', color: '#92400E' },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardInfo: { flex: 1 },
  trainerName: { fontSize: fontSize.md, fontFamily: fontFamily.bold, color: colors.text, letterSpacing: -0.2 },
  statsRow: { marginTop: 3, gap: 3 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: fontSize.xs, color: colors.textSecondary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 4 },
  ratingText: { fontSize: fontSize.xs, color: colors.textSecondary },
  priceCol: { alignItems: 'flex-end' },
  priceValue: { fontSize: fontSize.lg, fontFamily: fontFamily.bold, color: colors.primary, letterSpacing: -0.3 },
  priceLabel: { fontSize: fontSize.xs, color: colors.textLight },
  specialties: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  specialtyTag: {
    backgroundColor: colors.secondary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  specialtyText: { fontSize: fontSize.xs, color: colors.secondary, fontWeight: '600' },

  // Empty
  emptyContainer: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  retryBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.sm },

  // Filter modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  filterSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  sheetBody: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
  filterLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.textOnPrimary },
  verifiedToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  verifiedToggleText: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  verifiedToggleSwitch: {
    width: 40, height: 22, borderRadius: 11,
    backgroundColor: colors.border,
    padding: 2, justifyContent: 'center',
  },
  verifiedToggleSwitchOn: { backgroundColor: '#2D9CDB' },
  verifiedToggleKnob: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
  },
  verifiedToggleKnobOn: { transform: [{ translateX: 18 }] },
  sheetActions: {
    flexDirection: 'row', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  resetBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  resetBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  applyBtn: {
    flex: 2, paddingVertical: spacing.md, borderRadius: borderRadius.lg,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  applyBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textOnPrimary },
});
