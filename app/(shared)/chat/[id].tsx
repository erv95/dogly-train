import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  sendMessage,
  subscribeToMessages,
  getOrCreateChat,
} from '../../../src/services/chats';
import { Avatar } from '../../../src/components/ui';
import { colors, spacing, fontSize, borderRadius } from '../../../src/theme';
import { Chat, Message } from '../../../src/types';

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
  const { firebaseUser, userData } = useAuth();

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // Load or create chat
  useEffect(() => {
    if (!id || !firebaseUser || !userData) return;

    (async () => {
      try {
        // Check if id is a chatId or a userId (when coming from trainer detail)
        const chatDoc = await getDoc(doc(db, 'chats', id));

        if (chatDoc.exists()) {
          // It's a chat ID
          const chatData = { id: chatDoc.id, ...chatDoc.data() } as Chat;
          setChat(chatData);
          setHeaderName(chatData);
        } else {
          // It's a user ID — get or create chat
          const otherUserDoc = await getDoc(doc(db, 'users', id));
          if (!otherUserDoc.exists()) {
            setLoading(false);
            return;
          }
          const otherUser = otherUserDoc.data();
          const chatData = await getOrCreateChat(
            firebaseUser.uid,
            id,
            userData.displayName,
            otherUser.displayName,
            userData.photoURL,
            otherUser.photoURL
          );
          setChat(chatData);
          setHeaderName(chatData);
        }
      } catch (error) {
        console.error('Error loading chat:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, firebaseUser, userData]);

  const setHeaderName = (chatData: Chat) => {
    if (!firebaseUser) return;
    const otherId = chatData.participants.find((p) => p !== firebaseUser.uid) ?? '';
    const name = chatData.participantNames[otherId] ?? 'Chat';
    navigation.setOptions({ title: name });
  };

  // Subscribe to real-time messages
  useEffect(() => {
    if (!chat) return;
    const unsubscribe = subscribeToMessages(chat.id, (msgs) => {
      setMessages(msgs);
    });
    return unsubscribe;
  }, [chat?.id]);

  const handleSend = async () => {
    if (!inputText.trim() || !chat || !firebaseUser || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      await sendMessage(chat.id, firebaseUser.uid, text);
    } catch (error) {
      Alert.alert(t('common.error'), t('authErrors.generic'));
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const handleReport = () => {
    Alert.alert(t('chat.report'), t('chat.reportReason'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.reportReasons.offensive'),
        onPress: () => Alert.alert(t('common.ok'), t('chat.reportSent')),
      },
      {
        text: t('chat.reportReasons.spam'),
        onPress: () => Alert.alert(t('common.ok'), t('chat.reportSent')),
      },
      {
        text: t('chat.reportReasons.harassment'),
        onPress: () => Alert.alert(t('common.ok'), t('chat.reportSent')),
      },
    ]);
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleReport} style={{ paddingRight: spacing.md }}>
          <Ionicons name="flag-outline" size={22} color={colors.error} />
        </TouchableOpacity>
      ),
    });
  }, [chat]);

  const formatMsgTime = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === firebaseUser?.uid;
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>
            {item.text}
          </Text>
          <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>
            {formatMsgTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textSecondary }}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.messagesList}
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('chat.typeMessage')}
          placeholderTextColor={colors.textLight}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          <Ionicons
            name="send"
            size={20}
            color={inputText.trim() ? colors.textOnPrimary : colors.textLight}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  messagesList: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  msgRow: {
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  msgRowRight: {
    alignSelf: 'flex-end',
  },
  msgRowLeft: {
    alignSelf: 'flex-start',
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.background,
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: fontSize.md,
    lineHeight: 20,
  },
  msgTextMe: {
    color: colors.textOnPrimary,
  },
  msgTextOther: {
    color: colors.text,
  },
  msgTime: {
    fontSize: fontSize.xs,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  msgTimeMe: {
    color: colors.textOnPrimary + 'AA',
  },
  msgTimeOther: {
    color: colors.textLight,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendBtnDisabled: {
    backgroundColor: colors.backgroundSecondary,
  },
});
