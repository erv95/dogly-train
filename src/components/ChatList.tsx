import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { getUserChats } from '../services/chats';
import { Avatar } from './ui';
import { colors, spacing, fontSize } from '../theme';
import { Chat } from '../types';

export default function ChatList() {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [loadChats])
  );

  const getOtherUserName = (chat: Chat): string => {
    if (!firebaseUser) return '';
    const otherId = chat.participants.find((p) => p !== firebaseUser.uid) ?? '';
    return chat.participantNames[otherId] ?? '';
  };

  const getOtherUserPhoto = (chat: Chat): string | null => {
    if (!firebaseUser) return null;
    const otherId = chat.participants.find((p) => p !== firebaseUser.uid) ?? '';
    return chat.participantPhotos[otherId] ?? null;
  };

  const formatTime = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m`;
    if (diffHours < 24) return `${Math.floor(diffHours)}h`;
    if (diffHours < 48) return t('common.done'); // "yesterday" fallback
    return date.toLocaleDateString();
  };

  const renderChat = ({ item }: { item: Chat }) => {
    const otherName = getOtherUserName(item);
    const otherPhoto = getOtherUserPhoto(item);
    const isMyLastMsg = item.lastMessageBy === firebaseUser?.uid;

    return (
      <TouchableOpacity
        style={styles.chatRow}
        activeOpacity={0.7}
        onPress={() => router.push(`/(shared)/chat/${item.id}`)}
      >
        <Avatar uri={otherPhoto} name={otherName || '?'} size={52} />
        <View style={styles.chatInfo}>
          <View style={styles.chatTopRow}>
            <Text style={styles.chatName} numberOfLines={1}>{otherName}</Text>
            <Text style={styles.chatTime}>{formatTime(item.lastMessageAt)}</Text>
          </View>
          <Text style={styles.chatLastMsg} numberOfLines={1}>
            {isMyLastMsg ? `${t('common.done').charAt(0) === 'H' ? 'You' : 'Tú'}: ` : ''}
            {item.lastMessage || t('chat.startChat')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubbles-outline" size={64} color={colors.textLight} />
        <Text style={styles.emptyText}>{t('chat.noChats')}</Text>
      </View>
    );
  };

  return (
    <FlatList
      data={chats}
      keyExtractor={(item) => item.id}
      renderItem={renderChat}
      contentContainerStyle={chats.length === 0 ? styles.emptyList : styles.list}
      ListEmptyComponent={renderEmpty}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadChats();
          }}
          colors={[colors.primary]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: spacing.sm,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  chatInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  chatTime: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  chatLastMsg: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
