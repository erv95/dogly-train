import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { getUserChats, getOrCreateChat, markChatAsRead } from '../services/chats';
import { searchUsers } from '../services/users';
import { Avatar } from './ui';
import { ChatRowSkeleton } from './skeletons';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';
import { Chat, User, SYSTEM_UID } from '../types';

function formatTime(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffHours < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m`;
  if (diffHours < 24) return `${Math.floor(diffHours)}h`;
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

export default function ChatList() {
  const { t } = useTranslation();
  const { firebaseUser, userData } = useAuth();
  const router = useRouter();

  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New chat modal
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [startingChat, setStartingChat] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadChats = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const result = await getUserChats(firebaseUser.uid);
      setChats(result);
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useFocusEffect(useCallback(() => { loadChats(); }, [loadChats]));

  // Cleanup pending search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!text.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchUsers(text, firebaseUser?.uid ?? '');
        setSearchResults(results);
      } catch (e) {
        console.error('Search error', e);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleStartChat = async (user: User) => {
    if (!firebaseUser || !userData) return;
    setStartingChat(user.id);
    try {
      const chat = await getOrCreateChat(
        firebaseUser.uid,
        user.id,
        userData.displayName,
        user.displayName,
        userData.photoURL ?? null,
        user.photoURL ?? null,
      );
      setModalVisible(false);
      setSearchQuery('');
      setSearchResults([]);
      router.push(`/(shared)/chat/${chat.id}`);
    } catch (e) {
      console.error('Start chat error', e);
    } finally {
      setStartingChat(null);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const getOtherUserId = (chat: Chat): string => {
    if (!firebaseUser) return '';
    return chat.participants.find((p) => p !== firebaseUser.uid) ?? '';
  };

  const getOtherUserName = (chat: Chat): string => {
    const otherId = getOtherUserId(chat);
    if (otherId === SYSTEM_UID) return t('chat.systemName');
    return chat.participantNames[otherId] ?? '';
  };

  const getOtherUserPhoto = (chat: Chat): string | null => {
    const otherId = getOtherUserId(chat);
    if (otherId === SYSTEM_UID) return null;
    return chat.participantPhotos[otherId] ?? null;
  };

  const getUnreadCount = (chat: Chat): number => {
    if (!firebaseUser) return 0;
    return chat.unreadCounts?.[firebaseUser.uid] ?? 0;
  };

  const isSystemChat = (chat: Chat): boolean =>
    chat.participants.includes(SYSTEM_UID) || !!chat.isSystemChat;

  const handleOpenChat = useCallback((item: Chat) => {
    // Optimistically mark as read in local state
    if (firebaseUser) {
      setChats((prev) =>
        prev.map((c) =>
          c.id === item.id
            ? { ...c, unreadCounts: { ...c.unreadCounts, [firebaseUser.uid]: 0 } }
            : c
        )
      );
      markChatAsRead(item.id, firebaseUser.uid).catch(() => {});
    }
    router.push(`/(shared)/chat/${item.id}`);
  }, [firebaseUser, router]);

  const renderChat = useCallback(({ item }: { item: Chat }) => {
    const otherName = getOtherUserName(item);
    const otherPhoto = getOtherUserPhoto(item);
    const unread = getUnreadCount(item);
    const hasUnread = unread > 0;
    const isMyLastMsg = item.lastMessageBy === firebaseUser?.uid;
    const isSystem = isSystemChat(item);

    return (
      <TouchableOpacity
        style={[styles.chatRow, hasUnread && styles.chatRowUnread]}
        activeOpacity={0.7}
        onPress={() => handleOpenChat(item)}
      >
        {/* Avatar with system icon override */}
        <View style={styles.avatarWrap}>
          {isSystem ? (
            <View style={styles.systemAvatar}>
              <Ionicons name="paw" size={24} color={colors.primary} />
            </View>
          ) : (
            <Avatar uri={otherPhoto} name={otherName || '?'} size={52} />
          )}
          {isSystem && (
            <View style={styles.officialBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatTopRow}>
            <Text
              style={[styles.chatName, hasUnread && styles.chatNameUnread]}
              numberOfLines={1}
            >
              {otherName}
            </Text>
            <Text style={[styles.chatTime, hasUnread && styles.chatTimeUnread]}>
              {formatTime(item.lastMessageAt)}
            </Text>
          </View>

          <View style={styles.previewRow}>
            <Text
              style={[styles.chatLastMsg, hasUnread && styles.chatLastMsgUnread]}
              numberOfLines={1}
            >
              {isMyLastMsg && !isSystem
                ? `${t('chat.you')}: ${item.lastMessage}`
                : item.lastMessage || t('chat.startChat')}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [firebaseUser, t, handleOpenChat]);

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="chatbubbles-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>{t('chat.noChats')}</Text>
        <Text style={styles.emptySubtitle}>{t('chat.searchUser')}</Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.emptyBtnText}>{t('chat.newChat')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      {/* New chat FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('chat.newChat')}
      >
        <Ionicons name="create-outline" size={24} color="#fff" />
      </TouchableOpacity>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderChat}
        contentContainerStyle={chats.length === 0 ? styles.emptyList : styles.list}
        ListHeaderComponent={loading ? <ChatRowSkeleton count={6} /> : null}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadChats(); }}
            colors={[colors.primary]}
          />
        }
      />

      {/* Search modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('chat.newChat')}</Text>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Search input */}
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={colors.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('chat.searchPlaceholder')}
                placeholderTextColor={colors.textLight}
                value={searchQuery}
                onChangeText={handleSearch}
                autoFocus
                autoCapitalize="none"
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textLight} />
                </TouchableOpacity>
              )}
            </View>

            {/* Results */}
            {searching ? (
              <View style={styles.searchState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.searchStateText}>{t('chat.searching')}</Text>
              </View>
            ) : searchQuery.trim() && searchResults.length === 0 ? (
              <View style={styles.searchState}>
                <Ionicons name="person-outline" size={40} color={colors.border} />
                <Text style={styles.searchStateText}>{t('chat.notFound')}</Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(u) => u.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.resultRow}
                    activeOpacity={0.7}
                    onPress={() => handleStartChat(item)}
                    disabled={startingChat === item.id}
                  >
                    <Avatar uri={item.photoURL} name={item.displayName || '?'} size={46} />
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{item.displayName}</Text>
                      <View style={styles.resultMeta}>
                        {item.displayId && (
                          <View style={styles.idBadge}>
                            <Text style={styles.idText}>#{item.displayId}</Text>
                          </View>
                        )}
                        <Text style={styles.resultRole}>
                          {item.role === 'trainer' ? '🎓' : item.role === 'caretaker' ? '🏠' : '🐾'}
                        </Text>
                      </View>
                    </View>
                    {startingChat === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing.xs, paddingBottom: 80 },
  emptyList: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Empty state
  emptyContainer: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },

  // Chat row
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  chatRowUnread: {
    backgroundColor: colors.primary + '07',
  },

  // Avatar
  avatarWrap: { position: 'relative' },
  systemAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '30',
  },
  officialBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.background,
    borderRadius: 8,
  },

  // Chat info
  chatInfo: { flex: 1, minWidth: 0 },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  chatName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  chatNameUnread: { fontWeight: '700' },
  chatTime: { fontSize: fontSize.xs, color: colors.textLight, flexShrink: 0 },
  chatTimeUnread: { color: colors.primary, fontWeight: '600' },

  // Preview row
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chatLastMsg: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  chatLastMsgUnread: {
    color: colors.text,
    fontWeight: '500',
  },

  // Unread badge
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    flexShrink: 0,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadow.lg,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: spacing.xxl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    paddingVertical: 0,
  },
  searchState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  searchStateText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  resultInfo: { flex: 1 },
  resultName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  idBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  idText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  resultRole: { fontSize: fontSize.sm },
});
