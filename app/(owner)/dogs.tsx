import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/contexts/AuthContext';
import { getDogsByOwner, deleteDog } from '../../src/services/dogs';
import { getDogStats, getLevelInfo, DogStats } from '../../src/services/dogStats';
import { DogCardSkeleton } from '../../src/components/skeletons';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';
import { Dog } from '../../src/types';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.lg * 2 - spacing.md) / 2;

const SEX_ICON: Record<string, { icon: string; color: string }> = {
  male: { icon: '♂', color: '#3B82F6' },
  female: { icon: '♀', color: '#EC4899' },
};

export default function DogsScreen() {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [dogStatsMap, setDogStatsMap] = useState<Record<string, DogStats | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cancel-aware loader: if the screen unmounts (or refocuses) before the async
  // chain finishes, we skip all setState calls to avoid the "update on unmounted
  // component" warning and stale data clobbering newer fetches.
  const loadDogs = useCallback(async (cancelledRef: { current: boolean }) => {
    if (!firebaseUser) return;
    try {
      const result = await getDogsByOwner(firebaseUser.uid);
      if (cancelledRef.current) return;
      setDogs(result);
      // Load stats independently — errors here must not block dog list
      const entries = await Promise.all(
        result.map(async (dog) => {
          try {
            const stats = await getDogStats(dog.id);
            return [dog.id, stats] as [string, DogStats | null];
          } catch {
            return [dog.id, null] as [string, DogStats | null];
          }
        })
      );
      if (cancelledRef.current) return;
      setDogStatsMap(Object.fromEntries(entries));
    } catch (error) {
      console.error('Error loading dogs:', error);
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [firebaseUser]);

  useFocusEffect(
    useCallback(() => {
      const cancelledRef = { current: false };
      loadDogs(cancelledRef);
      return () => { cancelledRef.current = true; };
    }, [loadDogs])
  );

  const handleDelete = (dog: Dog) => {
    Alert.alert(
      t('dogs.deleteDog'),
      t('dogs.deleteConfirm', { name: dog.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDog(dog.id);
              setDogs((prev) => prev.filter((d) => d.id !== dog.id));
            } catch {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            }
          },
        },
      ]
    );
  };

  const LEVEL_COLORS = ['#22C55E', '#84CC16', '#F59E0B', '#EF4444', '#8B5CF6'];

  const renderDogCard = ({ item, index }: { item: Dog; index: number }) => {
    const sex = SEX_ICON[item.sex];
    const isLeft = index % 2 === 0;
    const stats = dogStatsMap[item.id];
    const levelInfo = getLevelInfo(stats?.level ?? 1);
    const levelColor = LEVEL_COLORS[(levelInfo.level - 1) % LEVEL_COLORS.length];

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/(shared)/dog-form?dogId=${item.id}`)}
        style={[styles.cardWrapper, isLeft ? { marginRight: spacing.sm / 2 } : { marginLeft: spacing.sm / 2 }]}
      >
        <View style={styles.card}>
          {/* Photo */}
          <View style={styles.photoContainer}>
            {item.photoURL ? (
              <Image source={{ uri: item.photoURL }} style={styles.dogPhoto} resizeMode="cover" />
            ) : (
              <LinearGradient
                colors={[colors.primary + '30', colors.primaryLight + '50']}
                style={styles.dogPhoto}
              >
                <Ionicons name="paw" size={40} color={colors.primary} />
              </LinearGradient>
            )}
            {/* Sex badge */}
            <View style={[styles.sexBadge, { backgroundColor: sex?.color + '22' }]}>
              <Text style={[styles.sexIcon, { color: sex?.color }]}>{sex?.icon}</Text>
            </View>
            {/* Delete button */}
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={14} color={colors.error} />
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View style={styles.cardBody}>
            <Text style={styles.dogName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.dogBreed} numberOfLines={1}>{item.breed}</Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statPill}>
                <Ionicons name="calendar-outline" size={10} color={colors.textSecondary} />
                <Text style={styles.statText}>{item.age}y</Text>
              </View>
              <View style={styles.statPill}>
                <Ionicons name="fitness-outline" size={10} color={colors.textSecondary} />
                <Text style={styles.statText}>{item.weight}kg</Text>
              </View>
            </View>

            {/* Issues */}
            {item.issues.length > 0 && (
              <View style={styles.issueRow}>
                <View style={styles.issueTag}>
                  <Text style={styles.issueTagText} numberOfLines={1}>
                    {t(`dogs.issueOptions.${item.issues[0]}`)}
                  </Text>
                </View>
                {item.issues.length > 1 && (
                  <Text style={styles.moreIssues}>+{item.issues.length - 1}</Text>
                )}
              </View>
            )}
          </View>

          {/* Level badge */}
          <View style={[styles.levelBadge, { backgroundColor: levelColor + '18', borderColor: levelColor + '40' }]}>
            <Text style={styles.levelEmoji}>{levelInfo.emoji}</Text>
            <Text style={[styles.levelText, { color: levelColor }]}>Lv. {levelInfo.level}</Text>
            {stats && <Text style={styles.levelXp}>{stats.xp} XP</Text>}
          </View>

          {/* Action buttons row */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.75}
              onPress={() => router.push(`/(shared)/courses?dogId=${item.id}&dogName=${encodeURIComponent(item.name)}`)}
            >
              <Ionicons name="school-outline" size={13} color={colors.primary} />
              <Text style={styles.actionBtnText}>{t('dogs.viewCourses')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.healthBtn]}
              activeOpacity={0.75}
              onPress={() => router.push(`/(shared)/dog-health/${item.id}?dogName=${encodeURIComponent(item.name)}`)}
            >
              <Ionicons name="medkit-outline" size={13} color="#EF4444" />
              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>{t('health.shortLabel')}</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom accent bar */}
          <View style={styles.accentBar} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="paw-outline" size={48} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{t('dogs.noDogs')}</Text>
      <Text style={styles.emptySubtitle}>{t('dogs.addDog')}</Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(shared)/dog-form')}>
        <Ionicons name="add" size={18} color={colors.textOnPrimary} />
        <Text style={styles.emptyBtnText}>{t('dogs.addDog')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{t('owner.myDogs')}</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/(shared)/dog-form')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.addButtonGradient}
          >
            <Ionicons name="add" size={24} color={colors.textOnPrimary} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <FlatList
        data={dogs}
        keyExtractor={(item) => item.id}
        renderItem={renderDogCard}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={dogs.length === 0 ? styles.emptyList : styles.list}
        ListHeaderComponent={loading ? <DogCardSkeleton count={3} /> : null}
        ListEmptyComponent={loading ? null : renderEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadDogs({ current: false }); }}
            colors={[colors.primary]}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerSpacer: {
    width: 44,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  addButton: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    ...shadow.md,
  },
  addButtonGradient: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    marginBottom: spacing.md,
  },
  emptyList: {
    flex: 1,
  },

  // Card
  cardWrapper: {
    width: CARD_WIDTH,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadow.md,
  },
  photoContainer: {
    width: '100%',
    height: CARD_WIDTH * 0.9,
    position: 'relative',
  },
  dogPhoto: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sexBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  sexIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  cardBody: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  dogName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  dogBreed: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  statText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  issueTag: {
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    flexShrink: 1,
  },
  issueTagText: {
    fontSize: 10,
    color: colors.warning,
    fontWeight: '700',
  },
  moreIssues: {
    fontSize: 10,
    color: colors.textLight,
    fontWeight: '600',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  levelEmoji: {
    fontSize: 13,
  },
  levelText: {
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  levelXp: {
    fontSize: 10,
    color: colors.textLight,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  healthBtn: {
    backgroundColor: '#EF4444' + '12',
    borderColor: '#EF4444' + '30',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  // Legacy single-button styles (kept for compat if referenced elsewhere)
  coursesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  coursesBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  accentBar: {
    height: 3,
    backgroundColor: colors.primary,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
    ...shadow.sm,
  },
  emptyBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
});
