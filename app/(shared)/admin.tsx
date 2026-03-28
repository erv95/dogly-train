import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { Avatar } from '../../src/components/ui';

interface Stats {
  totalUsers: number;
  totalOwners: number;
  totalTrainers: number;
  activeTrainers: number;
  pendingTrainers: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalChats: number;
  totalTransactions: number;
  totalDogs: number;
}

interface TrainerItem {
  id: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  experience: string;
  city: string;
  isActive: boolean;
  averageRating: number;
  totalReviews: number;
  createdAt: any;
}

interface RecentUser {
  id: string;
  displayName: string;
  email: string;
  role: string;
  createdAt: any;
}

type Tab = 'overview' | 'trainers' | 'recent';
type TrainerFilter = 'pending' | 'active' | 'all';

const EMPTY_STATS: Stats = {
  totalUsers: 0, totalOwners: 0, totalTrainers: 0,
  activeTrainers: 0, pendingTrainers: 0,
  newUsersThisWeek: 0, newUsersThisMonth: 0,
  totalChats: 0, totalTransactions: 0, totalDogs: 0,
};

export default function AdminPanel() {
  const { isAdmin } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [trainers, setTrainers] = useState<TrainerItem[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [trainerFilter, setTrainerFilter] = useState<TrainerFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isAdmin) { router.replace('/'); return; }
    loadAll();
  }, [isAdmin]);

  useEffect(() => {
    if (tab === 'trainers') loadTrainers();
  }, [trainerFilter, tab]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadTrainers(), loadRecentUsers()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const loadStats = async () => {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [usersSnap, chatsSnap, txSnap, dogsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'chats')),
        getDocs(collection(db, 'coin_transactions')),
        getDocs(collection(db, 'dogs')),
      ]);

      const users = usersSnap.docs.map(d => d.data());
      const owners = users.filter(u => u.role === 'owner').length;
      const trainers = users.filter(u => u.role === 'trainer').length;
      const activeTrainers = users.filter(u => u.role === 'trainer' && u.isActive).length;
      const pendingTrainers = users.filter(u => u.role === 'trainer' && !u.isActive).length;

      const newThisWeek = users.filter(u => {
        const d = u.createdAt?.toDate?.() ?? new Date(u.createdAt);
        return d >= weekAgo;
      }).length;

      const newThisMonth = users.filter(u => {
        const d = u.createdAt?.toDate?.() ?? new Date(u.createdAt);
        return d >= monthAgo;
      }).length;

      setStats({
        totalUsers: users.length,
        totalOwners: owners,
        totalTrainers: trainers,
        activeTrainers,
        pendingTrainers,
        newUsersThisWeek: newThisWeek,
        newUsersThisMonth: newThisMonth,
        totalChats: chatsSnap.size,
        totalTransactions: txSnap.size,
        totalDogs: dogsSnap.size,
      });
    } catch (e) {
      console.error('loadStats error', e);
    }
  };

  const loadTrainers = async () => {
    try {
      let q;
      if (trainerFilter === 'pending') {
        q = query(collection(db, 'users'), where('role', '==', 'trainer'), where('isActive', '==', false));
      } else if (trainerFilter === 'active') {
        q = query(collection(db, 'users'), where('role', '==', 'trainer'), where('isActive', '==', true));
      } else {
        q = query(collection(db, 'users'), where('role', '==', 'trainer'));
      }
      const snap = await getDocs(q);
      setTrainers(snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainerItem)));
    } catch (e) {
      console.error('loadTrainers error', e);
    }
  };

  const loadRecentUsers = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'users'), limit(20)));
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as RecentUser))
        .sort((a, b) => {
          const da = a.createdAt?.toDate?.() ?? new Date(a.createdAt ?? 0);
          const db2 = b.createdAt?.toDate?.() ?? new Date(b.createdAt ?? 0);
          return db2.getTime() - da.getTime();
        });
      setRecentUsers(sorted);
    } catch (e) {
      console.error('loadRecentUsers error', e);
    }
  };

  const handleToggleActive = async (trainer: TrainerItem) => {
    const newStatus = !trainer.isActive;
    Alert.alert(
      newStatus ? 'Activar entrenador' : 'Desactivar entrenador',
      `${trainer.displayName} ${newStatus ? 'aparecerá en búsquedas' : 'dejará de aparecer en búsquedas'}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: newStatus ? 'Activar' : 'Desactivar',
          style: newStatus ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', trainer.id), { isActive: newStatus });
              setTrainers(prev =>
                prev.map(t => t.id === trainer.id ? { ...t, isActive: newStatus } : t)
              );
              setStats(prev => ({
                ...prev,
                activeTrainers: prev.activeTrainers + (newStatus ? 1 : -1),
                pendingTrainers: prev.pendingTrainers + (newStatus ? -1 : 1),
              }));
            } catch {
              Alert.alert('Error', 'No se pudo actualizar el estado.');
            }
          },
        },
      ]
    );
  };

  const handleReject = async (trainer: TrainerItem) => {
    Alert.alert(
      'Rechazar entrenador',
      `¿Descartar la solicitud de ${trainer.displayName}? Se marcará como rechazado y no podrá acceder a la plataforma.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', trainer.id), { status: 'rejected' });
              setTrainers(prev => prev.filter(t => t.id !== trainer.id));
              setStats(prev => ({
                ...prev,
                pendingTrainers: Math.max(0, prev.pendingTrainers - 1),
              }));
            } catch {
              Alert.alert('Error', 'No se pudo rechazar al entrenador.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (ts: any): string => {
    if (!ts) return '—';
    const d = ts?.toDate?.() ?? new Date(ts);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const StatCard = ({ icon, label, value, color, sub }: {
    icon: string; label: string; value: number | string; color: string; sub?: string;
  }) => (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );

  const renderOverview = () => (
    <ScrollView
      contentContainerStyle={styles.overviewContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.sectionTitle}>Usuarios</Text>
      <View style={styles.statsGrid}>
        <StatCard icon="people-outline" label="Total usuarios" value={stats.totalUsers} color="#6366F1" />
        <StatCard icon="paw-outline" label="Dueños" value={stats.totalOwners} color="#F59E0B" />
        <StatCard icon="school-outline" label="Entrenadores" value={stats.totalTrainers} color="#10B981" />
        <StatCard icon="time-outline" label="Pendientes" value={stats.pendingTrainers} color="#EF4444" />
      </View>

      <Text style={styles.sectionTitle}>Crecimiento</Text>
      <View style={styles.statsGrid}>
        <StatCard
          icon="trending-up-outline"
          label="Esta semana"
          value={`+${stats.newUsersThisWeek}`}
          color="#8B5CF6"
          sub="nuevos registros"
        />
        <StatCard
          icon="calendar-outline"
          label="Este mes"
          value={`+${stats.newUsersThisMonth}`}
          color="#EC4899"
          sub="nuevos registros"
        />
        <StatCard icon="checkmark-circle-outline" label="Activos" value={stats.activeTrainers} color="#10B981" sub="entrenadores" />
        <StatCard icon="navigate-circle-outline" label="Perros" value={stats.totalDogs} color="#F59E0B" sub="registrados" />
      </View>

      <Text style={styles.sectionTitle}>Actividad</Text>
      <View style={styles.statsGrid}>
        <StatCard icon="chatbubbles-outline" label="Chats" value={stats.totalChats} color="#06B6D4" />
        <StatCard icon="card-outline" label="Pagos" value={stats.totalTransactions} color="#10B981" />
      </View>

      {stats.pendingTrainers > 0 && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => { setTab('trainers'); setTrainerFilter('pending'); }}>
          <Ionicons name="alert-circle" size={20} color="#EF4444" />
          <Text style={styles.alertText}>
            {stats.pendingTrainers} entrenador{stats.pendingTrainers > 1 ? 'es' : ''} pendiente{stats.pendingTrainers > 1 ? 's' : ''} de aprobación
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#EF4444" />
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  const renderTrainers = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.filterRow}>
        {(['pending', 'active', 'all'] as TrainerFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, trainerFilter === f && styles.filterTabActive]}
            onPress={() => setTrainerFilter(f)}
          >
            <Text style={[styles.filterTabText, trainerFilter === f && styles.filterTabTextActive]}>
              {f === 'pending' ? `Pendientes (${stats.pendingTrainers})` : f === 'active' ? `Activos (${stats.activeTrainers})` : 'Todos'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {trainers.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.border} />
          <Text style={styles.emptyText}>No hay entrenadores</Text>
        </View>
      ) : (
        <FlatList
          data={trainers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.trainerCard}>
              <View style={styles.trainerHeader}>
                <Avatar uri={item.photoURL} name={item.displayName} size={44} />
                <View style={styles.trainerInfo}>
                  <Text style={styles.trainerName}>{item.displayName}</Text>
                  <Text style={styles.trainerEmail}>{item.email}</Text>
                  <View style={styles.trainerMetas}>
                    {item.city ? <Text style={styles.metaText}>📍 {item.city}</Text> : null}
                    {item.averageRating > 0 ? <Text style={styles.metaText}>⭐ {item.averageRating.toFixed(1)}</Text> : null}
                    <Text style={styles.metaText}>🗓 {formatDate(item.createdAt)}</Text>
                  </View>
                </View>
                <View style={[styles.badge, item.isActive ? styles.badgeActive : styles.badgePending]}>
                  <Text style={[styles.badgeText, { color: item.isActive ? colors.success : '#F59E0B' }]}>
                    {item.isActive ? '✓ Activo' : '⏳ Pendiente'}
                  </Text>
                </View>
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, item.isActive ? styles.actionDeactivate : styles.actionActivate, { flex: 1 }]}
                  onPress={() => handleToggleActive(item)}
                >
                  <Ionicons
                    name={item.isActive ? 'close-circle-outline' : 'checkmark-circle-outline'}
                    size={16}
                    color={item.isActive ? colors.error : colors.success}
                  />
                  <Text style={[styles.actionText, { color: item.isActive ? colors.error : colors.success }]}>
                    {item.isActive ? 'Desactivar' : 'Aprobar'}
                  </Text>
                </TouchableOpacity>
                {!item.isActive && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionDeactivate, { flex: 1 }]}
                    onPress={() => handleReject(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>Rechazar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          contentContainerStyle={styles.trainerList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        />
      )}
    </View>
  );

  const renderRecent = () => (
    <FlatList
      data={recentUsers}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      renderItem={({ item }) => (
        <View style={styles.recentRow}>
          <View style={[styles.roleIcon, { backgroundColor: item.role === 'trainer' ? '#10B98118' : '#F59E0B18' }]}>
            <Ionicons
              name={item.role === 'trainer' ? 'school-outline' : 'paw-outline'}
              size={18}
              color={item.role === 'trainer' ? '#10B981' : '#F59E0B'}
            />
          </View>
          <View style={styles.recentInfo}>
            <Text style={styles.recentName}>{item.displayName || '—'}</Text>
            <Text style={styles.recentEmail}>{item.email}</Text>
          </View>
          <View style={styles.recentRight}>
            <Text style={styles.recentRole}>{item.role === 'trainer' ? 'Entrenador' : 'Dueño'}</Text>
            <Text style={styles.recentDate}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
      )}
      contentContainerStyle={styles.recentList}
      ListHeaderComponent={<Text style={[styles.sectionTitle, { marginHorizontal: spacing.lg }]}>Últimos registros</Text>}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Panel de Admin</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Main tabs */}
      <View style={styles.mainTabs}>
        {([
          { key: 'overview', icon: 'stats-chart-outline', label: 'Resumen' },
          { key: 'trainers', icon: 'school-outline', label: 'Entrenadores' },
          { key: 'recent', icon: 'people-outline', label: 'Usuarios' },
        ] as { key: Tab; icon: string; label: string }[]).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.mainTab, tab === t.key && styles.mainTabActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons name={t.icon as any} size={18} color={tab === t.key ? colors.primary : colors.textSecondary} />
            <Text style={[styles.mainTabText, tab === t.key && styles.mainTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <>
          {tab === 'overview' && renderOverview()}
          {tab === 'trainers' && renderTrainers()}
          {tab === 'recent' && renderRecent()}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  mainTabs: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  mainTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: spacing.md,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mainTabActive: { borderBottomColor: colors.primary },
  mainTabText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  mainTabTextActive: { color: colors.primary },
  loader: { flex: 1, alignSelf: 'center' },

  // Overview
  overviewContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: {
    width: '47%', backgroundColor: colors.background,
    borderRadius: borderRadius.lg, padding: spacing.md,
    borderTopWidth: 3, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statIcon: { width: 36, height: 36, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  statValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statSub: { fontSize: fontSize.xs, color: colors.textSecondary, opacity: 0.7 },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#EF444412', borderRadius: borderRadius.md,
    padding: spacing.md, marginTop: spacing.md,
    borderWidth: 1, borderColor: '#EF444430',
  },
  alertText: { flex: 1, fontSize: fontSize.sm, color: '#EF4444', fontWeight: '600' },

  // Trainers
  filterRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  filterTab: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.backgroundSecondary, alignItems: 'center' },
  filterTabActive: { backgroundColor: colors.primary },
  filterTabText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  filterTabTextActive: { color: '#fff' },
  trainerList: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  trainerCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  trainerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  trainerInfo: { flex: 1 },
  trainerName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  trainerEmail: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  trainerMetas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  metaText: { fontSize: fontSize.xs, color: colors.textSecondary },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeActive: { backgroundColor: '#10B98115' },
  badgePending: { backgroundColor: '#F59E0B15' },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  actionActivate: { backgroundColor: '#10B98112' },
  actionDeactivate: { backgroundColor: '#EF444410' },
  actionText: { fontSize: fontSize.sm, fontWeight: '600' },

  // Recent
  recentList: { paddingBottom: spacing.xxl },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  roleIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  recentInfo: { flex: 1 },
  recentName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  recentEmail: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  recentRight: { alignItems: 'flex-end' },
  recentRole: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primary },
  recentDate: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
});
