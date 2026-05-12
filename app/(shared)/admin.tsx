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
  TextInput,
  Image,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { Report, User, UserRole, UserStatus } from '../../src/types';
import { db, functions } from '../../src/config/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius } from '../../src/theme';
import { Avatar } from '../../src/components/ui';
import {
  listUsers,
  type RoleFilter,
  type StatusFilter,
  type DateFilter,
  type SortBy,
} from '../../src/services/adminUsers';
import UserActionsModal from '../../src/components/UserActionsModal';
import { AdminDisputesTab } from '../../src/components/admin/AdminDisputesTab';
import { AdminEventsTab } from '../../src/components/admin/AdminEventsTab';
import {
  listPlacesByStatus,
  approvePlace,
  rejectPlace,
  deletePlace,
} from '../../src/services/places';
import { Place, PlaceStatus, IdVerification, IdVerificationStatus } from '../../src/types';
import {
  listVerificationsByStatus,
  approveIdVerification,
  rejectIdVerification,
} from '../../src/services/idVerification';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { storage } from '../../src/config/firebase';

interface Stats {
  totalUsers: number;
  totalOwners: number;
  totalTrainers: number;
  activeTrainers: number;
  pendingTrainers: number;
  totalCaretakers: number;
  activeCaretakers: number;
  pendingCaretakers: number;
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

type Tab = 'overview' | 'trainers' | 'caretakers' | 'recent' | 'reports' | 'broadcast' | 'places' | 'verifications' | 'push' | 'disputes' | 'events';
type TrainerFilter = 'pending' | 'active' | 'all';
type BroadcastAudience = 'all' | 'owners' | 'trainers' | 'caretakers';

const EMPTY_STATS: Stats = {
  totalUsers: 0, totalOwners: 0, totalTrainers: 0,
  activeTrainers: 0, pendingTrainers: 0,
  totalCaretakers: 0, activeCaretakers: 0, pendingCaretakers: 0,
  newUsersThisWeek: 0, newUsersThisMonth: 0,
  totalChats: 0, totalTransactions: 0, totalDogs: 0,
};

export default function AdminPanel() {
  const { isAdmin, firebaseUser } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [trainers, setTrainers] = useState<TrainerItem[]>([]);
  const [caretakers, setCaretakers] = useState<TrainerItem[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);

  // ── Users tab — full management (filters, sort, pagination, actions) ───
  const [umList, setUmList] = useState<User[]>([]);
  const [umLoading, setUmLoading] = useState(false);
  const [umCursor, setUmCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [umRoleFilter, setUmRoleFilter] = useState<RoleFilter>('all');
  const [umStatusFilter, setUmStatusFilter] = useState<StatusFilter>('all');
  const [umDateFilter, setUmDateFilter] = useState<DateFilter>('all');
  const [umSort, setUmSort] = useState<SortBy>('createdDesc');
  const [umSearch, setUmSearch] = useState('');
  const [umModalUser, setUmModalUser] = useState<User | null>(null);
  // Broadcast state
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastAudience, setBroadcastAudience] = useState<BroadcastAudience>('all');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [trainerFilter, setTrainerFilter] = useState<TrainerFilter>('pending');
  const [caretakerFilter, setCaretakerFilter] = useState<TrainerFilter>('pending');
  const [reports, setReports] = useState<Report[]>([]);
  // Places moderation tab
  const [placesList, setPlacesList] = useState<Place[]>([]);
  const [placesFilter, setPlacesFilter] = useState<PlaceStatus>('pending');
  const [placesLoading, setPlacesLoading] = useState(false);
  // ID verification tab
  const [verifList, setVerifList] = useState<IdVerification[]>([]);
  const [verifFilter, setVerifFilter] = useState<IdVerificationStatus>('pending');
  const [verifLoading, setVerifLoading] = useState(false);
  // Push tracking dashboard
  interface PushAggStats {
    total: number;
    sent: number;
    no_token: number;
    invalid_token: number;
    error: number;
    last7Days: { day: string; total: number; sent: number }[];
    recentFailures: Array<{ id: string; type: string; status: string; errorMsg: string | null; recipientUid: string | null; createdAt: any }>;
  }
  const [pushStats, setPushStats] = useState<PushAggStats | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  /** Map of storagePath → resolved download URL, populated lazily as the admin
   *  expands a verification card. Avoids hammering Storage on first paint. */
  const [docUrlCache, setDocUrlCache] = useState<Record<string, string>>({});
  const [expandedVerifId, setExpandedVerifId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isAdmin) { router.replace('/'); return; }
    loadAll();
  }, [isAdmin]);

  useEffect(() => {
    if (tab === 'trainers') loadTrainers();
  }, [trainerFilter, tab]);

  useEffect(() => {
    if (tab === 'caretakers') loadCaretakers();
  }, [caretakerFilter, tab]);

  useEffect(() => {
    if (tab === 'places') loadPlaces();
  }, [placesFilter, tab]);

  useEffect(() => {
    if (tab === 'verifications') loadVerifications();
  }, [verifFilter, tab]);

  useEffect(() => {
    if (tab === 'push') loadPushStats();
  }, [tab]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadTrainers(), loadCaretakers(), loadRecentUsers(), loadReports()]);
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
      const trainers = users.filter(u => u.role === 'trainer' && u.status !== 'rejected').length;
      const activeTrainers = users.filter(u => u.role === 'trainer' && u.isActive && u.status !== 'rejected').length;
      const pendingTrainers = users.filter(u => u.role === 'trainer' && !u.isActive && u.status !== 'rejected').length;
      const caretakers = users.filter(u => u.role === 'caretaker' && u.status !== 'rejected').length;
      const activeCaretakers = users.filter(u => u.role === 'caretaker' && u.isActive && u.status !== 'rejected').length;
      const pendingCaretakers = users.filter(u => u.role === 'caretaker' && !u.isActive && u.status !== 'rejected').length;

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
        totalCaretakers: caretakers,
        activeCaretakers,
        pendingCaretakers,
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
      // Always exclude rejected trainers from all views
      const filtered = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as TrainerItem & { status?: string }))
        .filter(t => t.status !== 'rejected');
      setTrainers(filtered as TrainerItem[]);
    } catch (e) {
      console.error('loadTrainers error', e);
    }
  };

  const loadCaretakers = async () => {
    try {
      let q;
      if (caretakerFilter === 'pending') {
        q = query(collection(db, 'users'), where('role', '==', 'caretaker'), where('isActive', '==', false));
      } else if (caretakerFilter === 'active') {
        q = query(collection(db, 'users'), where('role', '==', 'caretaker'), where('isActive', '==', true));
      } else {
        q = query(collection(db, 'users'), where('role', '==', 'caretaker'));
      }
      const snap = await getDocs(q);
      const filtered = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as TrainerItem & { status?: string }))
        .filter(c => c.status !== 'rejected');
      setCaretakers(filtered as TrainerItem[]);
    } catch (e) {
      console.error('loadCaretakers error', e);
    }
  };

  const loadReports = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50))
      );
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
    } catch (e) {
      console.error('loadReports error', e);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, status: 'reviewed' | 'resolved') => {
    try {
      await updateDoc(doc(db, 'reports', reportId), { status });
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status } : r));
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el reporte.');
    }
  };

  const loadPlaces = async () => {
    setPlacesLoading(true);
    try {
      const { items } = await listPlacesByStatus(placesFilter, null, 50);
      setPlacesList(items);
    } catch (e) {
      console.error('loadPlaces error', e);
    } finally {
      setPlacesLoading(false);
    }
  };

  const handleApprovePlace = async (placeId: string) => {
    if (!firebaseUser) return;
    try {
      await approvePlace(placeId, firebaseUser.uid);
      setPlacesList((prev) => prev.filter((p) => p.id !== placeId));
    } catch {
      Alert.alert(t('common.error'), t('places.admin.approveError'));
    }
  };

  const handleRejectPlace = (placeId: string) => {
    if (!firebaseUser) return;
    Alert.alert(
      t('places.admin.rejectTitle'),
      t('places.admin.rejectConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('places.admin.reject'),
          style: 'destructive',
          onPress: async () => {
            try {
              await rejectPlace(placeId, firebaseUser.uid);
              setPlacesList((prev) => prev.filter((p) => p.id !== placeId));
            } catch {
              Alert.alert(t('common.error'), t('places.admin.rejectError'));
            }
          },
        },
      ]
    );
  };

  const handleDeletePlace = (placeId: string) => {
    Alert.alert(
      t('places.admin.deleteTitle'),
      t('places.admin.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlace(placeId);
              setPlacesList((prev) => prev.filter((p) => p.id !== placeId));
            } catch {
              Alert.alert(t('common.error'));
            }
          },
        },
      ]
    );
  };

  const loadVerifications = async () => {
    setVerifLoading(true);
    try {
      const { items } = await listVerificationsByStatus(verifFilter, null, 50);
      setVerifList(items);
    } catch (e) {
      console.error('loadVerifications error', e);
    } finally {
      setVerifLoading(false);
    }
  };

  const ensureDocUrl = async (path: string) => {
    if (docUrlCache[path]) return docUrlCache[path];
    try {
      const url = await getDownloadURL(storageRef(storage, path));
      setDocUrlCache((prev) => ({ ...prev, [path]: url }));
      return url;
    } catch (e) {
      console.warn('Could not load document', path, e);
      return null;
    }
  };

  const toggleExpandVerif = async (v: IdVerification) => {
    if (expandedVerifId === v.id) {
      setExpandedVerifId(null);
      return;
    }
    setExpandedVerifId(v.id);
    // Lazy-load the 3 download URLs in parallel.
    const paths = [v.frontPath, v.backPath, v.selfiePath].filter(Boolean) as string[];
    await Promise.all(paths.map((p) => ensureDocUrl(p)));
  };

  const handleApproveVerif = (v: IdVerification) => {
    if (!firebaseUser) return;
    Alert.alert(
      t('identityVerification.admin.approveTitle'),
      t('identityVerification.admin.approveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('identityVerification.admin.approve'),
          onPress: async () => {
            try {
              await approveIdVerification(v, firebaseUser.uid);
              setVerifList((prev) => prev.filter((x) => x.id !== v.id));
            } catch {
              Alert.alert(t('common.error'), t('identityVerification.admin.approveError'));
            }
          },
        },
      ]
    );
  };

  const handleRejectVerif = (v: IdVerification) => {
    if (!firebaseUser) return;
    Alert.alert(
      t('identityVerification.admin.rejectTitle'),
      t('identityVerification.admin.rejectBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('identityVerification.admin.reject'),
          style: 'destructive',
          onPress: async () => {
            try {
              await rejectIdVerification(v, firebaseUser.uid, 'rejected_by_admin');
              setVerifList((prev) => prev.filter((x) => x.id !== v.id));
            } catch {
              Alert.alert(t('common.error'), t('identityVerification.admin.rejectError'));
            }
          },
        },
      ]
    );
  };

  const loadPushStats = async () => {
    setPushLoading(true);
    try {
      // Pull last 7 days of push log entries; aggregate client-side to avoid
      // running multiple count queries (each costs 1 read = same price).
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const snap = await getDocs(
        query(
          collection(db, 'push_log'),
          where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
          orderBy('createdAt', 'desc'),
          limit(2000),
        ),
      );

      const buckets: Record<string, { total: number; sent: number }> = {};
      // Pre-fill last 7 days so empty days still show as 0 in the chart.
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        buckets[key] = { total: 0, sent: 0 };
      }

      let total = 0, sent = 0, noToken = 0, invalidToken = 0, errored = 0;
      const failures: PushAggStats['recentFailures'] = [];
      for (const d of snap.docs) {
        const data = d.data();
        total++;
        const day = data.day ?? data.createdAt?.toDate?.()?.toISOString?.()?.split('T')[0];
        if (day && buckets[day]) {
          buckets[day].total++;
          if (data.status === 'sent') buckets[day].sent++;
        }
        if (data.status === 'sent') sent++;
        else if (data.status === 'no_token') noToken++;
        else if (data.status === 'invalid_token') invalidToken++;
        else if (data.status === 'error') errored++;
        if (data.status !== 'sent' && failures.length < 20) {
          failures.push({
            id: d.id,
            type: data.type ?? 'unknown',
            status: data.status,
            errorMsg: data.errorMsg ?? null,
            recipientUid: data.recipientUid ?? null,
            createdAt: data.createdAt,
          });
        }
      }
      const last7Days = Object.entries(buckets)
        .map(([day, v]) => ({ day, total: v.total, sent: v.sent }));

      setPushStats({
        total, sent, no_token: noToken, invalid_token: invalidToken, error: errored,
        last7Days, recentFailures: failures,
      });
    } catch (e) {
      console.error('loadPushStats error', e);
    } finally {
      setPushLoading(false);
    }
  };

  const handleBanUser = async (userId: string, reportId: string) => {
    Alert.alert(
      'Banear usuario',
      '¿Estás seguro? El usuario no podrá acceder a la plataforma.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Banear',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all([
                updateDoc(doc(db, 'users', userId), { status: 'banned' }),
                updateDoc(doc(db, 'reports', reportId), { status: 'resolved' }),
              ]);
              setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: 'resolved' } : r));
            } catch {
              Alert.alert('Error', 'No se pudo banear al usuario.');
            }
          },
        },
      ]
    );
  };

  // ── Users tab loader (paginated) ──────────────────────────────────────────
  const loadUmFirstPage = useCallback(async () => {
    setUmLoading(true);
    try {
      const { items, nextCursor } = await listUsers({
        role: umRoleFilter,
        status: umStatusFilter,
        date: umDateFilter,
        searchText: umSearch,
        sortBy: umSort,
        pageSize: 30,
      });
      setUmList(items);
      setUmCursor(nextCursor);
    } catch (e) {
      console.error('loadUmFirstPage error', e);
    } finally {
      setUmLoading(false);
    }
  }, [umRoleFilter, umStatusFilter, umDateFilter, umSearch, umSort]);

  const loadUmMore = useCallback(async () => {
    if (!umCursor || umLoading) return;
    setUmLoading(true);
    try {
      const { items, nextCursor } = await listUsers({
        role: umRoleFilter,
        status: umStatusFilter,
        date: umDateFilter,
        searchText: umSearch,
        sortBy: umSort,
        pageSize: 30,
        cursor: umCursor,
      });
      setUmList((prev) => [...prev, ...items]);
      setUmCursor(nextCursor);
    } catch (e) {
      console.error('loadUmMore error', e);
    } finally {
      setUmLoading(false);
    }
  }, [umCursor, umLoading, umRoleFilter, umStatusFilter, umDateFilter, umSearch, umSort]);

  // Reload first page whenever filters / sort change
  useEffect(() => {
    if (tab !== 'recent') return;
    loadUmFirstPage();
  }, [tab, loadUmFirstPage]);

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

  const REASON_LABELS: Record<string, string> = {
    offensive: 'Contenido ofensivo',
    spam: 'Spam',
    harassment: 'Acoso',
    other: 'Otro',
  };

  const STATUS_COLOR: Record<string, string> = {
    pending: '#EF4444',
    reviewed: '#F59E0B',
    resolved: '#10B981',
  };

  const STATUS_LABEL: Record<string, string> = {
    pending: 'Pendiente',
    reviewed: 'Revisado',
    resolved: 'Resuelto',
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
        <StatCard icon="school-outline" label="Entrenadores" value={stats.activeTrainers} color="#10B981" sub={stats.pendingTrainers > 0 ? `${stats.pendingTrainers} pend.` : undefined} />
        <StatCard icon="home-outline" label="Cuidadores" value={stats.activeCaretakers} color="#8B5CF6" sub={stats.pendingCaretakers > 0 ? `${stats.pendingCaretakers} pend.` : undefined} />
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

      {stats.pendingCaretakers > 0 && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => { setTab('caretakers'); setCaretakerFilter('pending'); }}>
          <Ionicons name="alert-circle" size={20} color="#EF4444" />
          <Text style={styles.alertText}>
            {stats.pendingCaretakers} cuidador{stats.pendingCaretakers > 1 ? 'es' : ''} pendiente{stats.pendingCaretakers > 1 ? 's' : ''} de aprobación
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

  const renderCaretakers = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.filterRow}>
        {(['pending', 'active', 'all'] as TrainerFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, caretakerFilter === f && styles.filterTabActive]}
            onPress={() => setCaretakerFilter(f)}
          >
            <Text style={[styles.filterTabText, caretakerFilter === f && styles.filterTabTextActive]}>
              {f === 'pending' ? `Pendientes (${stats.pendingCaretakers})` : f === 'active' ? `Activos (${stats.activeCaretakers})` : 'Todos'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {caretakers.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.border} />
          <Text style={styles.emptyText}>No hay cuidadores</Text>
        </View>
      ) : (
        <FlatList
          data={caretakers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const businessName = (item as any).businessName;
            const isBusiness = (item as any).accountType === 'business';
            const displayTitle = isBusiness && businessName ? businessName : item.displayName;
            return (
              <View style={styles.trainerCard}>
                <View style={styles.trainerHeader}>
                  <Avatar uri={item.photoURL} name={displayTitle} size={44} />
                  <View style={styles.trainerInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.trainerName}>{displayTitle}</Text>
                      {isBusiness && (
                        <Ionicons name="business" size={14} color={colors.secondary} />
                      )}
                    </View>
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
            );
          }}
          contentContainerStyle={styles.trainerList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        />
      )}
    </View>
  );

  const renderReports = () => {
    const pending = reports.filter((r) => r.status === 'pending');
    const rest = reports.filter((r) => r.status !== 'pending');
    const sorted = [...pending, ...rest];

    return (
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={[styles.recentList, { padding: spacing.md, gap: spacing.md }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.border} />
            <Text style={styles.emptyText}>No hay reportes</Text>
          </View>
        }
        ListHeaderComponent={
          <Text style={[styles.sectionTitle, { marginBottom: spacing.md }]}>
            Reportes ({pending.length} pendientes)
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.trainerCard}>
            {/* Header */}
            <View style={styles.trainerHeader}>
              <View style={[styles.roleIcon, { backgroundColor: STATUS_COLOR[item.status] + '18' }]}>
                <Ionicons name="flag" size={18} color={STATUS_COLOR[item.status]} />
              </View>
              <View style={styles.trainerInfo}>
                <Text style={styles.trainerName}>{REASON_LABELS[item.reason] ?? item.reason}</Text>
                <Text style={styles.trainerEmail}>Chat: {item.chatId?.slice(0, 12)}...</Text>
                {item.details ? (
                  <Text style={[styles.trainerEmail, { marginTop: 4 }]}>"{item.details}"</Text>
                ) : null}
                <Text style={styles.metaText}>🗓 {formatDate(item.createdAt)}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '18' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>
                  {STATUS_LABEL[item.status]}
                </Text>
              </View>
            </View>
            {/* Actions */}
            {item.status !== 'resolved' && (
              <View style={styles.actionRow}>
                {item.status === 'pending' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionActivate, { flex: 1 }]}
                    onPress={() => handleUpdateReportStatus(item.id, 'reviewed')}
                  >
                    <Ionicons name="eye-outline" size={16} color={colors.warning} />
                    <Text style={[styles.actionText, { color: colors.warning }]}>Marcar revisado</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionActivate, { flex: 1 }]}
                  onPress={() => handleUpdateReportStatus(item.id, 'resolved')}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                  <Text style={[styles.actionText, { color: colors.success }]}>Resolver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionDeactivate, { flex: 1 }]}
                  onPress={() => handleBanUser(item.reportedUser, item.id)}
                >
                  <Ionicons name="ban-outline" size={16} color={colors.error} />
                  <Text style={[styles.actionText, { color: colors.error }]}>Banear</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
    );
  };

  const renderRecent = () => {
    const ROLE_OPTIONS: { v: RoleFilter; key: string }[] = [
      { v: 'all', key: 'admin.userManagement.roleAll' },
      { v: 'owner', key: 'auth.owner' },
      { v: 'trainer', key: 'auth.trainer' },
      { v: 'caretaker', key: 'auth.caretaker' },
    ];
    const STATUS_OPTIONS: { v: StatusFilter; key: string; emoji: string }[] = [
      { v: 'all', key: 'admin.userManagement.statusAll', emoji: '⚪' },
      { v: 'active', key: 'admin.userManagement.statusActions.active', emoji: '🟢' },
      { v: 'suspended', key: 'admin.userManagement.statusActions.suspended', emoji: '🟡' },
      { v: 'banned', key: 'admin.userManagement.statusActions.banned', emoji: '🔴' },
    ];
    const DATE_OPTIONS: { v: DateFilter; key: string }[] = [
      { v: 'all', key: 'admin.userManagement.dateAll' },
      { v: '7d', key: 'admin.userManagement.date7d' },
      { v: '30d', key: 'admin.userManagement.date30d' },
      { v: '90d', key: 'admin.userManagement.date90d' },
    ];
    const SORT_OPTIONS: { v: SortBy; key: string; icon: keyof typeof Ionicons.glyphMap }[] = [
      { v: 'createdDesc', key: 'admin.userManagement.sortNewest', icon: 'arrow-down' },
      { v: 'createdAsc',  key: 'admin.userManagement.sortOldest', icon: 'arrow-up' },
      { v: 'nameAsc',     key: 'admin.userManagement.sortAz',     icon: 'text-outline' },
      { v: 'nameDesc',    key: 'admin.userManagement.sortZa',     icon: 'text' },
    ];

    return (
      <FlatList
        data={umList}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={umLoading} onRefresh={loadUmFirstPage} tintColor={colors.primary} />}
        contentContainerStyle={styles.recentList}
        onEndReached={loadUmMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
            {/* Search */}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar nombre, email o ID…"
                placeholderTextColor={colors.textLight}
                value={umSearch}
                onChangeText={setUmSearch}
                autoCapitalize="none"
              />
              {umSearch ? (
                <TouchableOpacity onPress={() => setUmSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textLight} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filter rows */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
              {ROLE_OPTIONS.map((opt) => {
                const active = umRoleFilter === opt.v;
                return (
                  <TouchableOpacity
                    key={opt.v}
                    style={[styles.audienceChip, active && styles.audienceChipActive]}
                    onPress={() => setUmRoleFilter(opt.v)}
                  >
                    <Text style={[styles.audienceChipText, active && styles.audienceChipTextActive]}>
                      {t(opt.key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
              {STATUS_OPTIONS.map((opt) => {
                const active = umStatusFilter === opt.v;
                return (
                  <TouchableOpacity
                    key={opt.v}
                    style={[styles.audienceChip, active && styles.audienceChipActive]}
                    onPress={() => setUmStatusFilter(opt.v)}
                  >
                    <Text style={[styles.audienceChipText, active && styles.audienceChipTextActive]}>
                      {opt.emoji} {t(opt.key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {DATE_OPTIONS.map((opt) => {
                const active = umDateFilter === opt.v;
                return (
                  <TouchableOpacity
                    key={opt.v}
                    style={[styles.audienceChip, active && styles.audienceChipActive]}
                    onPress={() => setUmDateFilter(opt.v)}
                  >
                    <Text style={[styles.audienceChipText, active && styles.audienceChipTextActive]}>
                      {t(opt.key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Sort row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
              {SORT_OPTIONS.map((opt) => {
                const active = umSort === opt.v;
                return (
                  <TouchableOpacity
                    key={opt.v}
                    style={[styles.audienceChip, active && styles.audienceChipActive]}
                    onPress={() => setUmSort(opt.v)}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={12}
                      color={active ? colors.textOnPrimary : colors.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.audienceChipText, active && styles.audienceChipTextActive]}>
                      {t(opt.key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Counter */}
            <Text style={styles.umCounter}>
              {t('admin.userManagement.showing', { count: umList.length })}
              {umCursor ? ` · ${t('admin.userManagement.moreAvailable')}` : ''}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const status: UserStatus = item.status ?? 'active';
          const tint = status === 'banned' ? colors.error
            : status === 'suspended' ? colors.warning
            : null;
          return (
            <TouchableOpacity
              style={[styles.umRow, tint && { backgroundColor: tint + '0F', borderColor: tint + '40' }]}
              onPress={() => setUmModalUser(item)}
              activeOpacity={0.7}
            >
              <Avatar uri={item.photoURL} name={item.displayName || '?'} size={44} />
              <View style={styles.umRowBody}>
                <View style={styles.umRowTopLine}>
                  <Text style={styles.umRowName} numberOfLines={1}>{item.displayName || '—'}</Text>
                  {status !== 'active' && (
                    <View style={[styles.umStatusBadge, { backgroundColor: (tint ?? colors.success) }]}>
                      <Text style={styles.umStatusBadgeText}>
                        {t(`admin.userManagement.statusActions.${status}`)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.umRowEmail} numberOfLines={1}>{item.email}</Text>
                <View style={styles.umRowMetaRow}>
                  <View style={[
                    styles.umRolePill,
                    { backgroundColor: (item.role === 'trainer' ? '#10B981' : item.role === 'caretaker' ? '#0EA5E9' : '#F59E0B') + '22' },
                  ]}>
                    <Ionicons
                      name={item.role === 'trainer' ? 'school' : item.role === 'caretaker' ? 'home' : 'paw'}
                      size={11}
                      color={item.role === 'trainer' ? '#10B981' : item.role === 'caretaker' ? '#0EA5E9' : '#F59E0B'}
                    />
                    <Text style={[
                      styles.umRolePillText,
                      { color: item.role === 'trainer' ? '#10B981' : item.role === 'caretaker' ? '#0EA5E9' : '#F59E0B' },
                    ]}>
                      {t(`auth.${item.role}`)}
                    </Text>
                  </View>
                  <Text style={styles.umRowDate}>{formatDate(item.createdAt)}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          umCursor ? (
            <TouchableOpacity style={styles.umLoadMoreBtn} onPress={loadUmMore} disabled={umLoading}>
              {umLoading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={styles.umLoadMoreText}>{t('admin.userManagement.loadMore')}</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          !umLoading ? (
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Ionicons name="people-outline" size={36} color={colors.textLight} />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
                {t('admin.userManagement.empty')}
              </Text>
            </View>
          ) : null
        }
      />
    );
  };

  // ── Broadcast ────────────────────────────────────────────────────────────────

  const handleSendBroadcast = () => {
    if (!broadcastMsg.trim()) return;
    Alert.alert(
      'Confirmar difusión',
      `¿Enviar este mensaje a todos los ${broadcastAudience === 'all' ? 'usuarios' : broadcastAudience === 'owners' ? 'dueños' : 'entrenadores'}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          style: 'destructive',
          onPress: async () => {
            setBroadcastSending(true);
            try {
              const sendBroadcast = httpsCallable(functions, 'sendBroadcastMessage');
              const result: any = await sendBroadcast({ message: broadcastMsg.trim(), audience: broadcastAudience });
              Alert.alert('Enviado', `Mensaje enviado a ${result.data?.sent ?? '?'} usuarios.`);
              setBroadcastMsg('');
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Error al enviar difusión');
            } finally {
              setBroadcastSending(false);
            }
          },
        },
      ]
    );
  };

  const renderPlacesAdmin = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.audienceRow}>
        {(['pending', 'approved', 'rejected'] as PlaceStatus[]).map((s) => {
          const active = placesFilter === s;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.audienceChip, active && styles.audienceChipActive]}
              onPress={() => setPlacesFilter(s)}
            >
              <Text style={[styles.audienceChipText, active && styles.audienceChipTextActive]}>
                {t(`places.status.${s}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {placesLoading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={placesList}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          ListEmptyComponent={
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Ionicons name="map-outline" size={48} color={colors.textLight} />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
                {t('places.admin.empty')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.recentRow}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => router.push(`/(shared)/places/${item.id}`)}
                activeOpacity={0.85}
              >
                <Text style={{ fontWeight: '800', color: colors.text }}>{item.name}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>
                  {t(`places.categories.${item.category}`)} · {item.city}, {item.country}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textLight, marginTop: 2 }} numberOfLines={2}>
                  {item.description}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {placesFilter === 'pending' && (
                  <>
                    <TouchableOpacity
                      style={styles.placeIconBtnApprove}
                      onPress={() => handleApprovePlace(item.id)}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.placeIconBtnReject}
                      onPress={() => handleRejectPlace(item.id)}
                    >
                      <Ionicons name="close" size={18} color="#fff" />
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity
                  style={styles.placeIconBtnDelete}
                  onPress={() => handleDeletePlace(item.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );

  const renderVerifications = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.audienceRow}>
        {(['pending', 'verified', 'rejected'] as IdVerificationStatus[]).map((s) => {
          const active = verifFilter === s;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.audienceChip, active && styles.audienceChipActive]}
              onPress={() => setVerifFilter(s)}
            >
              <Text style={[styles.audienceChipText, active && styles.audienceChipTextActive]}>
                {t(`identityVerification.admin.statusFilters.${s}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {verifLoading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={verifList}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          ListEmptyComponent={
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Ionicons name="shield-outline" size={48} color={colors.textLight} />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
                {t('identityVerification.admin.empty')}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const expanded = expandedVerifId === item.id;
            return (
              <View style={styles.recentRow}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => toggleExpandVerif(item)}
                  activeOpacity={0.85}
                >
                  <Text style={{ fontWeight: '800', color: colors.text }}>
                    UID {item.userId.slice(0, 10)}…
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>
                    {t(`identityVerification.docTypes.${item.documentType}`)} · {' '}
                    {item.submittedAt?.toDate?.().toLocaleDateString?.() ?? ''}
                  </Text>
                  {expanded && (
                    <View style={styles.verifPhotosRow}>
                      {[item.frontPath, item.backPath, item.selfiePath].filter(Boolean).map((p, i) => {
                        const url = docUrlCache[p as string];
                        return (
                          <View key={i} style={styles.verifPhotoBox}>
                            {url
                              ? <Image source={{ uri: url }} style={styles.verifPhoto} resizeMode="cover" />
                              : <ActivityIndicator color={colors.primary} size="small" />}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </TouchableOpacity>
                {verifFilter === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.placeIconBtnApprove}
                      onPress={() => handleApproveVerif(item)}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.placeIconBtnReject}
                      onPress={() => handleRejectVerif(item)}
                    >
                      <Ionicons name="close" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );

  const renderPushDashboard = () => {
    const successRate = pushStats && pushStats.total > 0
      ? (pushStats.sent / pushStats.total) * 100
      : null;
    const maxBar = pushStats?.last7Days.reduce((m, d) => Math.max(m, d.total), 0) ?? 0;

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {pushLoading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.xxl }} />
        ) : !pushStats ? (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: spacing.lg }}>
            {t('admin.push.empty')}
          </Text>
        ) : (
          <>
            {/* KPI strip */}
            <View style={styles.pushKpiRow}>
              <View style={styles.pushKpi}>
                <Text style={styles.pushKpiValue}>{pushStats.total}</Text>
                <Text style={styles.pushKpiLabel}>{t('admin.push.total7d')}</Text>
              </View>
              <View style={styles.pushKpi}>
                <Text style={[styles.pushKpiValue, { color: '#27AE60' }]}>
                  {successRate != null ? `${Math.round(successRate)}%` : '—'}
                </Text>
                <Text style={styles.pushKpiLabel}>{t('admin.push.successRate')}</Text>
              </View>
              <View style={styles.pushKpi}>
                <Text style={[styles.pushKpiValue, { color: '#EF4444' }]}>
                  {pushStats.no_token + pushStats.invalid_token + pushStats.error}
                </Text>
                <Text style={styles.pushKpiLabel}>{t('admin.push.failures')}</Text>
              </View>
            </View>

            {/* Last 7 days bar chart */}
            <View style={styles.pushChartCard}>
              <Text style={styles.pushChartTitle}>{t('admin.push.last7Days')}</Text>
              <View style={styles.pushBarsRow}>
                {pushStats.last7Days.map((d) => {
                  const heightPct = maxBar > 0 ? (d.total / maxBar) * 100 : 0;
                  const sentPct = d.total > 0 ? (d.sent / d.total) * 100 : 0;
                  const dayLabel = d.day.split('-').slice(1).join('/'); // MM/DD
                  return (
                    <View key={d.day} style={styles.pushBarCol}>
                      <Text style={styles.pushBarCount}>{d.total > 0 ? d.total : ''}</Text>
                      <View style={styles.pushBarTrack}>
                        <View
                          style={[
                            styles.pushBar,
                            {
                              height: d.total > 0 ? `${Math.max(8, heightPct)}%` : '4%',
                              backgroundColor: d.total > 0 ? colors.primary : colors.border,
                            },
                          ] as any}
                        >
                          {d.total > 0 && (
                            <View
                              style={[
                                styles.pushBarSentOverlay,
                                { height: `${sentPct}%`, backgroundColor: '#27AE60' },
                              ] as any}
                            />
                          )}
                        </View>
                      </View>
                      <Text style={styles.pushBarLabel}>{dayLabel}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.pushLegendRow}>
                <View style={styles.pushLegendItem}>
                  <View style={[styles.pushLegendDot, { backgroundColor: '#27AE60' }]} />
                  <Text style={styles.pushLegendText}>{t('admin.push.legendSent')}</Text>
                </View>
                <View style={styles.pushLegendItem}>
                  <View style={[styles.pushLegendDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.pushLegendText}>{t('admin.push.legendTotal')}</Text>
                </View>
              </View>
            </View>

            {/* Breakdown by failure reason */}
            <View style={styles.pushBreakdownCard}>
              <Text style={styles.pushChartTitle}>{t('admin.push.failureBreakdown')}</Text>
              <View style={styles.pushBreakdownRow}>
                <Text style={styles.pushBreakdownLabel}>{t('admin.push.statusNoToken')}</Text>
                <Text style={styles.pushBreakdownValue}>{pushStats.no_token}</Text>
              </View>
              <View style={styles.pushBreakdownRow}>
                <Text style={styles.pushBreakdownLabel}>{t('admin.push.statusInvalidToken')}</Text>
                <Text style={styles.pushBreakdownValue}>{pushStats.invalid_token}</Text>
              </View>
              <View style={styles.pushBreakdownRow}>
                <Text style={styles.pushBreakdownLabel}>{t('admin.push.statusError')}</Text>
                <Text style={styles.pushBreakdownValue}>{pushStats.error}</Text>
              </View>
            </View>

            {/* Recent failures */}
            {pushStats.recentFailures.length > 0 && (
              <View style={styles.pushBreakdownCard}>
                <Text style={styles.pushChartTitle}>{t('admin.push.recentFailures')}</Text>
                {pushStats.recentFailures.map((f) => (
                  <View key={f.id} style={styles.pushFailureRow}>
                    <Text style={styles.pushFailureType}>{f.type}</Text>
                    <Text style={styles.pushFailureMsg} numberOfLines={1}>
                      {f.status}{f.errorMsg ? ` · ${f.errorMsg}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    );
  };

  const renderBroadcast = () => (
    <ScrollView contentContainerStyle={styles.broadcastContainer}>
      <Text style={styles.broadcastHint}>
        Envía un mensaje directo a todos los usuarios de la app. Aparecerá en su chat del sistema.
      </Text>

      {/* Audience selector */}
      <Text style={styles.broadcastLabel}>Destinatarios</Text>
      <View style={styles.audienceRow}>
        {(['all', 'owners', 'trainers', 'caretakers'] as BroadcastAudience[]).map((a) => {
          const labels = { all: 'Todos', owners: 'Dueños', trainers: 'Entrenadores', caretakers: 'Cuidadores' };
          return (
            <TouchableOpacity
              key={a}
              style={[styles.audienceChip, broadcastAudience === a && styles.audienceChipActive]}
              onPress={() => setBroadcastAudience(a)}
            >
              <Text style={[styles.audienceChipText, broadcastAudience === a && styles.audienceChipTextActive]}>
                {labels[a]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Message input */}
      <Text style={styles.broadcastLabel}>Mensaje</Text>
      <TextInput
        style={styles.broadcastInput}
        value={broadcastMsg}
        onChangeText={setBroadcastMsg}
        placeholder="Escribe tu mensaje..."
        placeholderTextColor={colors.textLight}
        multiline
        maxLength={1000}
        textAlignVertical="top"
      />
      <Text style={styles.broadcastCharCount}>{broadcastMsg.length}/1000</Text>

      <TouchableOpacity
        style={[styles.broadcastBtn, (!broadcastMsg.trim() || broadcastSending) && styles.broadcastBtnDisabled]}
        onPress={handleSendBroadcast}
        disabled={!broadcastMsg.trim() || broadcastSending}
      >
        {broadcastSending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="megaphone-outline" size={18} color="#fff" />
            <Text style={styles.broadcastBtnText}>Enviar a todos</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mainTabsScroll}>
        <View style={styles.mainTabs}>
          {([
            { key: 'overview', icon: 'stats-chart-outline', label: 'Resumen' },
            { key: 'trainers', icon: 'school-outline', label: 'Entrenadores' },
            { key: 'caretakers', icon: 'home-outline', label: 'Cuidadores' },
            { key: 'recent', icon: 'people-outline', label: 'Usuarios' },
            { key: 'places', icon: 'map-outline', label: 'Lugares' },
            { key: 'verifications', icon: 'shield-checkmark-outline', label: 'Verificación' },
            { key: 'push', icon: 'notifications-outline', label: 'Push' },
            { key: 'reports', icon: 'flag-outline', label: 'Reportes' },
            { key: 'disputes', icon: 'alert-circle-outline', label: 'Disputas' },
            { key: 'events', icon: 'time-outline', label: 'Eventos' },
            { key: 'broadcast', icon: 'megaphone-outline', label: 'Difusión' },
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
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <>
          {tab === 'overview' && renderOverview()}
          {tab === 'trainers' && renderTrainers()}
          {tab === 'caretakers' && renderCaretakers()}
          {tab === 'recent' && renderRecent()}
          {tab === 'places' && renderPlacesAdmin()}
          {tab === 'verifications' && renderVerifications()}
          {tab === 'push' && renderPushDashboard()}
          {tab === 'reports' && renderReports()}
          {tab === 'disputes' && <AdminDisputesTab />}
          {tab === 'events' && <AdminEventsTab />}
          {tab === 'broadcast' && renderBroadcast()}
        </>
      )}

      {/* User actions modal — opens when admin taps a row in the Users tab */}
      <UserActionsModal
        visible={!!umModalUser}
        user={umModalUser}
        adminUid={firebaseUser?.uid ?? ''}
        onClose={() => setUmModalUser(null)}
        onUpdated={(uid, patch) => {
          // Patch the row in-place so the UI reflects the change immediately
          setUmList((prev) => prev.map((u) => (u.id === uid ? ({ ...u, ...patch } as User) : u)));
          // Keep the modal showing the updated user
          setUmModalUser((prev) => (prev && prev.id === uid ? ({ ...prev, ...patch } as User) : prev));
        }}
      />
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

  // Tab scroll
  mainTabsScroll: { flexGrow: 0 },

  // Broadcast
  broadcastContainer: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  broadcastHint: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  broadcastLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  audienceRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  audienceChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border,
  },
  audienceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  audienceChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  audienceChipTextActive: { color: '#fff' },
  broadcastInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: spacing.md, minHeight: 140, fontSize: fontSize.md,
    color: colors.text, backgroundColor: colors.backgroundSecondary,
  },
  broadcastCharCount: { fontSize: fontSize.xs, color: colors.textLight, textAlign: 'right' },
  broadcastBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.primary,
    paddingVertical: spacing.md, borderRadius: borderRadius.lg, marginTop: spacing.sm,
  },
  broadcastBtnDisabled: { opacity: 0.4 },
  broadcastBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },

  // ── Users tab — management UI ─────────────────────────────────────────
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    padding: 0,
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  umCounter: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  umRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  umRowBody: { flex: 1, gap: 2 },
  umRowTopLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  umRowName: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, flexShrink: 1 },
  umStatusBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  umStatusBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  umRowEmail: { fontSize: fontSize.xs, color: colors.textSecondary },
  umRowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  umRolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  umRolePillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  umRowDate: { fontSize: 11, color: colors.textLight, fontWeight: '600' },
  umLoadMoreBtn: {
    margin: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
  },
  umLoadMoreText: { color: colors.primary, fontWeight: '800', fontSize: fontSize.sm },

  // Places admin tab
  placeIconBtnApprove: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center',
  },
  placeIconBtnReject: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center',
  },
  placeIconBtnDelete: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
  },

  // Verification tab
  verifPhotosRow: {
    flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm,
  },
  verifPhotoBox: {
    flex: 1, aspectRatio: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  verifPhoto: { width: '100%', height: '100%' },

  // Push dashboard
  pushKpiRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  pushKpi: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: spacing.md, borderRadius: borderRadius.lg,
  },
  pushKpiValue: {
    fontSize: 24, fontWeight: '900', color: colors.text,
    fontVariant: ['tabular-nums'] as any,
  },
  pushKpiLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4,
    textAlign: 'center', paddingHorizontal: 4,
  },

  pushChartCard: {
    backgroundColor: colors.background,
    padding: spacing.md, borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  pushChartTitle: {
    fontSize: 10, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pushBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 130, gap: 4,
  },
  pushBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  pushBarCount: { fontSize: 9, fontWeight: '800', color: colors.text, minHeight: 11 },
  pushBarTrack: {
    width: '70%', height: 90,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginTop: 2,
  },
  pushBar: {
    width: '100%', borderRadius: 4,
    justifyContent: 'flex-end',
  },
  pushBarSentOverlay: { width: '100%', borderRadius: 4 },
  pushBarLabel: { fontSize: 9, color: colors.textSecondary, fontWeight: '700', marginTop: 4 },

  pushLegendRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center', marginTop: 4 },
  pushLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pushLegendDot: { width: 10, height: 10, borderRadius: 5 },
  pushLegendText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },

  pushBreakdownCard: {
    backgroundColor: colors.background,
    padding: spacing.md, borderRadius: borderRadius.lg,
    gap: 6,
  },
  pushBreakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  pushBreakdownLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  pushBreakdownValue: {
    fontSize: fontSize.md, color: colors.text, fontWeight: '800',
    fontVariant: ['tabular-nums'] as any,
  },
  pushFailureRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  pushFailureType: { fontSize: 11, fontWeight: '800', color: colors.text, minWidth: 100 },
  pushFailureMsg: { flex: 1, fontSize: 11, color: colors.textSecondary },
});
