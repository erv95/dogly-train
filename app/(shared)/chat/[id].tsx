import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  Linking,
  StatusBar,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, addDoc, collection, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, UploadMetadata } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { EmojiKeyboard, en as emojiEn } from 'rn-emoji-keyboard';
import type { EmojiType } from 'rn-emoji-keyboard';
import { db, storage } from '../../../src/config/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  sendMessage,
  sendMediaMessage,
  subscribeToMessages,
  getOrCreateChat,
  markChatAsRead,
} from '../../../src/services/chats';
import { SYSTEM_UID } from '../../../src/types';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../../src/theme';
import { Chat, Message } from '../../../src/types';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { detectPII } from '../../../src/utils/piiDetect';
import ServiceReportCard from '../../../src/components/ServiceReportCard';
import ServiceReportModal from '../../../src/components/ServiceReportModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMsgTime(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // Same day → just time
  if (date.toDateString() === now.toDateString()) return time;
  // Within 7 days → weekday + time
  if (diffMs < 7 * 24 * 60 * 60 * 1000) {
    return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }
  // Older → date + time
  return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${time}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Upload helper ─────────────────────────────────────────────────────────────

async function uploadToStorage(uri: string, path: string, contentType?: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, path);
  const metadata: UploadMetadata | undefined = contentType ? { contentType } : undefined;
  await uploadBytes(storageRef, blob, metadata);
  return getDownloadURL(storageRef);
}

// Emoji translations are loaded on-demand to keep bundle small.
// English is statically imported as fallback.
const EMOJI_LANG_LOADERS: Record<string, () => Promise<any>> = {
  es: () => import('rn-emoji-keyboard').then((m) => m.es),
  fr: () => import('rn-emoji-keyboard').then((m) => m.fr),
  pt: () => import('rn-emoji-keyboard').then((m) => m.pt),
  de: () => import('rn-emoji-keyboard').then((m) => m.de),
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatDetailScreen() {
  // `prefill` is read once on mount via the dedicated effect below — callers
  // (e.g. the booking screen "+10 semanas" CTA) can pass a draft message that
  // pre-populates the input without auto-sending.
  const { id, prefill } = useLocalSearchParams<{ id: string; prefill?: string }>();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { firebaseUser, userData } = useAuth();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const haptics = useHaptics();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState(typeof prefill === 'string' ? prefill : '');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Attachment menu
  const [attachVisible, setAttachVisible] = useState(false);
  // Caretaker-only: post-service report modal
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Emoji picker
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Keyboard
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  // Playback state for the currently-loaded audio message
  const [playback, setPlayback] = useState<{
    msgId: string;
    isPlaying: boolean;
    position: number;  // milliseconds
    duration: number;  // milliseconds (0 if unknown)
  } | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isMountedRef = useRef(true);

  // While the user drags the audio thumb, override displayed position with this value
  const [seekingPosition, setSeekingPosition] = useState<number | null>(null);
  // Width of the currently-rendered playing audio's progress track (px)
  const trackWidthRef = useRef(0);
  // Mirror playback into a ref so PanResponder callbacks always read the latest value
  const playbackRef = useRef<typeof playback>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const textInputRef = useRef<TextInput>(null);
  const isNearBottomRef = useRef(true);
  const innerRef = useRef<View>(null);
  const containerBottomRef = useRef(0);
  const switchingToEmojiRef = useRef(false);

  // ── Load chat ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id || !firebaseUser || !userData) return;

    (async () => {
      try {
        const chatDoc = await getDoc(doc(db, 'chats', id));
        if (chatDoc.exists()) {
          const chatData = { id: chatDoc.id, ...chatDoc.data() } as Chat;
          // Security: verify current user is actually a participant
          if (!chatData.participants.includes(firebaseUser.uid)) {
            console.error('Access denied: user not in chat participants');
            setLoading(false);
            return;
          }
          setChat(chatData);
          setHeaderName(chatData);
        } else {
          // id is a userId — create or open direct chat
          const otherUserDoc = await getDoc(doc(db, 'users', id));
          if (!otherUserDoc.exists()) { setLoading(false); return; }
          const otherUser = otherUserDoc.data();
          const chatData = await getOrCreateChat(
            firebaseUser.uid, id,
            userData.displayName, otherUser.displayName,
            userData.photoURL, otherUser.photoURL
          );
          setChat(chatData);
          setHeaderName(chatData);
        }
      } catch (err) {
        console.error('Error loading chat:', err);
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

  // ── Messages subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!chat || !firebaseUser) return;
    const uid = firebaseUser.uid; // capture so the closure doesn't drift on token refresh
    const unsub = subscribeToMessages(chat.id, (msgs) => {
      setMessages(msgs);
      // Only auto-scroll if user is near the bottom (not reading old messages)
      if (isNearBottomRef.current) {
        setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);
      }
      // Clear unread count when new messages arrive while chat is open.
      // onSnapshot fires immediately on subscribe with the current data, so
      // this handles the initial-open case too — no need for a separate
      // mark-as-read call outside the callback (it would just double-write).
      markChatAsRead(chat.id, uid).catch(() => {});
    });
    return unsub;
  }, [chat?.id, firebaseUser?.uid]);

  // ── Derived (needed early by report callbacks) ────────────────────────

  const recipientId = chat?.participants.find((p) => p !== firebaseUser?.uid);
  const isSystemChat = chat?.participants.includes(SYSTEM_UID);
  const isBusy = sending || uploading || isRecording;

  // ── Report ─────────────────────────────────────────────────────────────

  const submitReport = useCallback(async (reason: string) => {
    if (!chat || !firebaseUser || !recipientId) return;
    try {
      await addDoc(collection(db, 'reports'), {
        reportedBy: firebaseUser.uid,
        reportedUser: recipientId,
        chatId: chat.id,
        reason,
        details: '',
        status: 'pending',
        createdAt: Timestamp.now(),
      });
      Alert.alert(t('common.ok'), t('chat.reportSent'));
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    }
  }, [chat, firebaseUser, recipientId, t]);

  const handleReport = useCallback(() => {
    Alert.alert(t('chat.report'), t('chat.reportReason'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('chat.reportReasons.offensive'), onPress: () => submitReport('offensive') },
      { text: t('chat.reportReasons.spam'), onPress: () => submitReport('spam') },
      { text: t('chat.reportReasons.harassment'), onPress: () => submitReport('harassment') },
    ]);
  }, [t, submitReport]);

  useEffect(() => {
    if (!chat) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleReport}
          style={{ paddingRight: spacing.md }}
          accessibilityRole="button"
          accessibilityLabel={t('chat.report')}
        >
          <Ionicons name="flag-outline" size={22} color={colors.error} />
        </TouchableOpacity>
      ),
    });
  }, [chat, handleReport, navigation]);

  // ── Emoji picker ──────────────────────────────────────────────────────────

  const [emojiTranslation, setEmojiTranslation] = useState<any>(emojiEn);

  useEffect(() => {
    const lang = userData?.language ?? 'en';
    if (lang === 'en') {
      setEmojiTranslation(emojiEn);
      return;
    }
    const loader = EMOJI_LANG_LOADERS[lang];
    if (!loader) return;
    let cancelled = false;
    loader().then((translation) => {
      if (!cancelled) setEmojiTranslation(translation);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userData?.language]);

  const handleEmojiSelected = (emoji: EmojiType) => {
    setInputText((prev) => prev + emoji.emoji);
  };

  const toggleEmojiPicker = () => {
    if (emojiOpen) {
      // Close emojis → reopen keyboard
      setEmojiOpen(false);
      textInputRef.current?.focus();
    } else {
      // Flag transition so keyboardDidHide doesn't remove padding (prevents flicker)
      switchingToEmojiRef.current = true;
      Keyboard.dismiss();
      setAttachVisible(false);
      setTimeout(() => {
        setKeyboardVisible(false);  // Now safe to remove padding — emoji panel takes over
        setEmojiOpen(true);
        switchingToEmojiRef.current = false;
      }, 100);
    }
  };

  // ── Send text ──────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!inputText.trim() || !chat || !firebaseUser || isBusy) return;
    const text = inputText.trim();

    // PII / leave-platform nudge: warn before sending phone numbers, emails
    // or mentions of external messaging apps. Owner+provider can still send
    // anything — we only educate, never block.
    const pii = detectPII(text);
    if (pii.hasPhone || pii.hasEmail || pii.hasExternalApp) {
      // Build a body that lists what we detected so the warning is concrete.
      const bullets: string[] = [];
      if (pii.hasPhone) bullets.push(`• ${t('chat.piiWarning.phone')}`);
      if (pii.hasEmail) bullets.push(`• ${t('chat.piiWarning.email')}`);
      if (pii.hasExternalApp) bullets.push(`• ${t('chat.piiWarning.externalApp')}`);
      const body = `${t('chat.piiWarning.body')}\n\n${bullets.join('\n')}\n\n${t('chat.piiWarning.tip')}`;

      Alert.alert(t('chat.piiWarning.title'), body, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('chat.piiWarning.sendAnyway'), onPress: () => doSendText(text) },
      ]);
      return;
    }

    await doSendText(text);
  };

  const doSendText = async (text: string) => {
    if (!chat || !firebaseUser) return;
    setInputText('');
    setSending(true);
    haptics.tap();
    try {
      await sendMessage(chat.id, firebaseUser.uid, text, recipientId);
    } catch {
      haptics.error();
      Alert.alert(t('common.error'), t('authErrors.generic'));
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  // ── Photo from gallery ────────────────────────────────────────────────────

  const handleGallery = async () => {
    setAttachVisible(false);
    if (!chat || !firebaseUser) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const path = `chat_media/${chat.id}/${firebaseUser.uid}/images/${Date.now()}.jpg`;
      const url = await uploadToStorage(result.assets[0].uri, path, 'image/jpeg');
      await sendMediaMessage(chat.id, firebaseUser.uid, 'image', url, {}, recipientId);
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setUploading(false);
    }
  };

  // ── Photo from camera ─────────────────────────────────────────────────────

  const handleCamera = async () => {
    setAttachVisible(false);
    if (!chat || !firebaseUser) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('chat.permissionTitle'), t('chat.cameraPermissionDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const path = `chat_media/${chat.id}/${firebaseUser.uid}/images/${Date.now()}.jpg`;
      const url = await uploadToStorage(result.assets[0].uri, path, 'image/jpeg');
      await sendMediaMessage(chat.id, firebaseUser.uid, 'image', url, {}, recipientId);
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setUploading(false);
    }
  };

  // ── File attachment ────────────────────────────────────────────────────────

  const handleFile = async () => {
    setAttachVisible(false);
    if (!chat || !firebaseUser) return;
    const ALLOWED_TYPES = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/*',
    ];
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_TYPES,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // Validate file size (10 MB limit, matches Storage rules)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (asset.size && asset.size > MAX_FILE_SIZE) {
      Alert.alert(t('common.error'), t('chat.fileTooLarge'));
      return;
    }
    // Sanitize file name: remove path separators and special chars
    const safeName = (asset.name ?? 'file').replace(/[\/\\:*?"<>|]/g, '_');
    setUploading(true);
    try {
      const path = `chat_media/${chat.id}/${firebaseUser.uid}/files/${Date.now()}_${safeName}`;
      const url = await uploadToStorage(asset.uri, path, asset.mimeType ?? 'application/octet-stream');
      await sendMediaMessage(chat.id, firebaseUser.uid, 'file', url, {
        fileName: safeName,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        fileSize: asset.size,
      }, recipientId);
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setUploading(false);
    }
  };

  // ── Audio recording ────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('chat.permissionTitle'), t('chat.micPermissionDenied'));
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingSecs(0);
      durationTimer.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
    } catch {
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current || !chat || !firebaseUser) return;
    if (durationTimer.current) clearInterval(durationTimer.current);
    setIsRecording(false);
    const duration = recordingSecs;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      // Discard recordings shorter than 1 second (accidental taps)
      if (!uri || duration < 1) {
        setRecordingSecs(0);
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        return;
      }

      setUploading(true);
      const path = `chat_media/${chat.id}/${firebaseUser.uid}/audio/${Date.now()}.m4a`;
      const url = await uploadToStorage(uri, path, 'audio/mp4');
      await sendMediaMessage(chat.id, firebaseUser.uid, 'audio', url, {
        audioDuration: duration,
      }, recipientId);
    } catch {
      Alert.alert(t('common.error'), t('authErrors.generic'));
    } finally {
      setUploading(false);
      setRecordingSecs(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    }
  };

  // ── Audio playback ─────────────────────────────────────────────────────────

  // Keep playback ref in sync so PanResponder reads fresh duration
  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  // Convert a touch X (relative to track) into a position in milliseconds
  const computePositionFromX = useCallback((touchX: number): number | null => {
    const width = trackWidthRef.current;
    const current = playbackRef.current;
    if (!width || !current || !current.duration) return null;
    const ratio = Math.max(0, Math.min(1, touchX / width));
    return Math.round(ratio * current.duration);
  }, []);

  // PanResponder lives across renders; reads positions via refs (no stale closures)
  const audioPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Don't let the parent ScrollView/FlatList steal vertical scroll while seeking
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const pos = computePositionFromX(evt.nativeEvent.locationX);
          if (pos !== null) setSeekingPosition(pos);
        },
        onPanResponderMove: (evt) => {
          const pos = computePositionFromX(evt.nativeEvent.locationX);
          if (pos !== null) setSeekingPosition(pos);
        },
        onPanResponderRelease: async (evt) => {
          const pos = computePositionFromX(evt.nativeEvent.locationX);
          if (pos !== null && soundRef.current) {
            try {
              await soundRef.current.setPositionAsync(pos);
            } catch {
              // ignore — playback may have ended or sound disposed
            }
          }
          setSeekingPosition(null);
        },
        onPanResponderTerminate: () => setSeekingPosition(null),
      }),
    [computePositionFromX]
  );

  const playAudio = async (msgId: string, url: string) => {
    try {
      // Tapping the same loaded audio toggles play/pause
      if (soundRef.current && playback?.msgId === msgId) {
        if (playback.isPlaying) {
          await soundRef.current.pauseAsync();
        } else {
          await soundRef.current.playAsync();
        }
        return;
      }

      // Different audio: stop and dispose previous
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      // Ensure audio plays even in iOS silent mode
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      // Optimistic state so the icon flips to "pause" while loading
      setPlayback({ msgId, isPlaying: true, position: 0, duration: 0 });

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, progressUpdateIntervalMillis: 100 },
        (status) => {
          if (!isMountedRef.current) return;
          // Only react to loaded statuses — the loading phase is normal,
          // not a reason to clear playback state.
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            // Reset to start so a tap plays from beginning next time.
            // Use setStatusAsync with shouldPlay:false to prevent auto-resume —
            // a bare setPositionAsync would let the sound replay because the
            // internal shouldPlay flag was still true from createAsync.
            setPlayback({ msgId, isPlaying: false, position: 0, duration: status.durationMillis ?? 0 });
            soundRef.current?.setStatusAsync({ shouldPlay: false, positionMillis: 0 }).catch(() => {});
            return;
          }
          setPlayback({
            msgId,
            isPlaying: status.isPlaying,
            position: status.positionMillis ?? 0,
            duration: status.durationMillis ?? 0,
          });
        }
      );

      if (!isMountedRef.current) {
        sound.unloadAsync().catch(() => {});
        return;
      }
      soundRef.current = sound;
    } catch {
      setPlayback(null);
    }
  };

  // ── Keyboard tracking ───────────────────────────────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      if (Platform.OS === 'android' && containerBottomRef.current > 0) {
        // measureInWindow returns window-relative coords (below status bar),
        // but screenY is screen-relative (includes status bar). Bridge the gap.
        // Fallback to 24 (Android default density-independent status bar) if unavailable.
        const statusBarH = StatusBar.currentHeight || 24;
        const containerBottomScreen = containerBottomRef.current + statusBarH;
        const overlap = Math.max(0, containerBottomScreen - e.endCoordinates.screenY);
        setKeyboardHeight(overlap);
      } else {
        setKeyboardHeight(e.endCoordinates.height);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      // Don't remove padding if we're transitioning to the emoji panel
      if (!switchingToEmojiRef.current) {
        setKeyboardVisible(false);
      }
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Cleanup sound and recording on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      if (durationTimer.current) {
        clearInterval(durationTimer.current);
        durationTimer.current = null;
      }
      // Auto-stop recording if user navigates away mid-recording
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      // Release audio mode
      Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    };
  }, []);

  // ── Render message ─────────────────────────────────────────────────────────

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isMe = item.senderId === firebaseUser?.uid;

    // Caretaker service reports get a custom card (photos + structured meta).
    if (item.type === 'service_report' && item.serviceReport) {
      return (
        <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
          <ServiceReportCard
            report={item.serviceReport}
            timeLabel={formatMsgTime(item.createdAt)}
            isOwn={isMe}
          />
        </View>
      );
    }

    // Image messages get a special bubble with no padding
    if (item.type === 'image' && item.mediaURL) {
      return (
        <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => Linking.openURL(item.mediaURL!)}
            style={[styles.imageBubble, isMe ? styles.bubbleMe : styles.bubbleOther]}
          >
            <Image source={{ uri: item.mediaURL }} style={styles.msgImage} resizeMode="cover" />
            <View style={styles.imageTimeOverlay}>
              <Text style={styles.imageTime}>{formatMsgTime(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>

          {/* File */}
          {item.type === 'file' && (
            <TouchableOpacity
              style={styles.fileRow}
              onPress={() => item.mediaURL && Linking.openURL(item.mediaURL)}
            >
              <View style={[styles.fileIconBox, isMe && styles.fileIconBoxMe]}>
                <Ionicons name="document-outline" size={22} color={isMe ? colors.primary : colors.textSecondary} />
              </View>
              <Text
                style={[styles.fileName, isMe ? styles.msgTextMe : styles.msgTextOther]}
                numberOfLines={2}
              >
                {item.fileName ?? t('chat.file')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Audio */}
          {item.type === 'audio' && item.mediaURL && (() => {
            const isCurrent = playback?.msgId === item.id;
            const isPlaying = isCurrent && playback!.isPlaying;
            const totalMs = (isCurrent && playback!.duration > 0)
              ? playback!.duration
              : (item.audioDuration ?? 0) * 1000;
            // While the user is dragging, show the seek preview position
            const livePos = isCurrent ? playback!.position : 0;
            const positionMs = isCurrent && seekingPosition !== null ? seekingPosition : livePos;
            const progress = totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;
            const isSeeking = isCurrent && seekingPosition !== null;
            // Show elapsed time when playing or while seeking; total duration otherwise
            const showLive = isCurrent && (isPlaying || isSeeking);
            const trackHandlers = isCurrent && totalMs > 0 ? audioPanResponder.panHandlers : {};
            const onTrackLayout = isCurrent
              ? (e: LayoutChangeEvent) => { trackWidthRef.current = e.nativeEvent.layout.width; }
              : undefined;
            return (
              <View style={styles.audioRow}>
                <TouchableOpacity
                  onPress={() => playAudio(item.id, item.mediaURL!)}
                  activeOpacity={0.8}
                  style={[styles.playBtn, isMe ? styles.playBtnMe : styles.playBtnOther]}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={18}
                    color="#fff"
                  />
                </TouchableOpacity>
                <View style={styles.audioBody}>
                  {/* Drag area — taller than the visible bar so it's easy to grab */}
                  <View
                    style={styles.progressHitArea}
                    onLayout={onTrackLayout}
                    {...trackHandlers}
                  >
                    <View style={[styles.progressTrack, isMe ? styles.progressTrackMe : styles.progressTrackOther]}>
                      <View
                        style={[
                          styles.progressFill,
                          isMe ? styles.progressFillMe : styles.progressFillOther,
                          { width: `${progress * 100}%` },
                        ]}
                      />
                    </View>
                    {/* Position thumb (slightly bigger when dragging for feedback) */}
                    {isCurrent && (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.progressThumb,
                          isMe ? styles.progressThumbMe : styles.progressThumbOther,
                          isSeeking && styles.progressThumbActive,
                          { left: `${progress * 100}%` },
                        ]}
                      />
                    )}
                  </View>
                  <Text style={[styles.audioTimeText, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>
                    {showLive
                      ? formatDuration(Math.floor(positionMs / 1000))
                      : formatDuration(Math.round(totalMs / 1000))}
                  </Text>
                </View>
              </View>
            );
          })()}

          {/* Text */}
          {(!item.type || item.type === 'text') && (
            <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>
              {item.text}
            </Text>
          )}

          <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>
            {formatMsgTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  }, [firebaseUser?.uid, playback, seekingPosition, audioPanResponder, t]);

  // ── Layout ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <View
        ref={innerRef}
        style={[
          { flex: 1 },
          Platform.OS === 'android' && keyboardVisible && { paddingBottom: keyboardHeight },
        ]}
        onLayout={() => {
          // Only measure once on initial layout (before any keyboard padding changes the style).
          // The container's screen position doesn't change — only internal padding does.
          if (Platform.OS === 'android' && innerRef.current && containerBottomRef.current === 0) {
            innerRef.current.measureInWindow((_x, y, _w, h) => {
              containerBottomRef.current = y + h;
            });
          }
        }}
      >
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.msgList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScrollBeginDrag={() => { setAttachVisible(false); setEmojiOpen(false); }}
          onScroll={(e) => {
            // Inverted list: offset 0 = bottom. Near bottom if offset < 150px
            isNearBottomRef.current = e.nativeEvent.contentOffset.y < 150;
          }}
          scrollEventThrottle={200}
        />

      {/* Attach menu popup */}
      {attachVisible && (
        <View style={styles.attachMenu}>
          <TouchableOpacity style={styles.attachItem} onPress={handleCamera}>
            <View style={[styles.attachIcon, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="camera-outline" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>{t('chat.camera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachItem} onPress={handleGallery}>
            <View style={[styles.attachIcon, { backgroundColor: '#8B5CF6' }]}>
              <Ionicons name="images-outline" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>{t('chat.gallery')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachItem} onPress={handleFile}>
            <View style={[styles.attachIcon, { backgroundColor: '#3B82F6' }]}>
              <Ionicons name="document-outline" size={22} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>{t('chat.file')}</Text>
          </TouchableOpacity>
          {/* Caretaker-only: post-service report */}
          {userData?.role === 'caretaker' && (
            <TouchableOpacity
              style={styles.attachItem}
              onPress={() => { setAttachVisible(false); setReportModalVisible(true); }}
            >
              <View style={[styles.attachIcon, { backgroundColor: '#16A34A' }]}>
                <Ionicons name="walk-outline" size={22} color="#fff" />
              </View>
              <Text style={styles.attachLabel}>{t('serviceReports.attachLabel')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Input bar — normal flow layout, sits below FlatList */}
      {!isSystemChat ? (
        <View style={[
          styles.inputWrapper,
          {
            // Keyboard or emoji open: they handle safe area, just minimal padding
            // Nothing open: safe area padding to sit above nav bar
            paddingBottom: (keyboardVisible || emojiOpen) ? 4 : Math.max(insets.bottom, 4),
          },
        ]}>
          {isRecording ? (
            <View style={styles.recordingBar}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{formatDuration(recordingSecs)}</Text>
              <Text style={styles.recordingHint}>{t('chat.recording')}</Text>
              <TouchableOpacity onPress={stopRecording} style={styles.recordingStop}>
                <Ionicons name="stop-circle" size={32} color={colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputBar}>
              {/* WhatsApp-style pill container */}
              <View style={styles.inputPill}>
                <TouchableOpacity
                  style={styles.pillIconBtn}
                  onPress={toggleEmojiPicker}
                >
                  <Ionicons
                    name={emojiOpen ? 'keypad-outline' : 'happy-outline'}
                    size={24}
                    color={emojiOpen ? colors.primary : colors.textSecondary}
                  />
                </TouchableOpacity>

                <TextInput
                  ref={textInputRef}
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={(v) => { setInputText(v); setAttachVisible(false); }}
                  onFocus={() => { setEmojiOpen(false); setAttachVisible(false); }}
                  placeholder={t('chat.typeMessage')}
                  placeholderTextColor={colors.textLight}
                  multiline
                  maxLength={1000}
                />

                <TouchableOpacity
                  style={styles.pillIconBtn}
                  onPress={() => { Keyboard.dismiss(); setEmojiOpen(false); setAttachVisible((v) => !v); }}
                >
                  <Ionicons
                    name={attachVisible ? 'close' : 'attach'}
                    size={24}
                    color={colors.textSecondary}
                    style={!attachVisible ? { transform: [{ rotate: '-45deg' }] } : undefined}
                  />
                </TouchableOpacity>

                {!inputText.trim() && (
                  <TouchableOpacity style={styles.pillIconBtn} onPress={handleCamera}>
                    <Ionicons name="camera-outline" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Send / Mic circle — outside the pill */}
              {inputText.trim() || isBusy ? (
                <TouchableOpacity
                  style={[styles.actionCircle, isBusy && styles.actionCircleBusy]}
                  onPress={handleSend}
                  disabled={!inputText.trim() || isBusy}
                >
                  {isBusy
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="send" size={18} color="#fff" />}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.actionCircle}
                  onPressIn={startRecording}
                  onPressOut={stopRecording}
                >
                  <Ionicons name="mic" size={22} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.systemBanner, { paddingBottom: keyboardVisible ? spacing.md : Math.max(insets.bottom, spacing.md) }]}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textLight} />
          <Text style={styles.systemBannerText}>{t('chat.systemReadOnly')}</Text>
        </View>
      )}

      {/* Inline emoji keyboard — sized to match the real keyboard */}
      {emojiOpen && (
        <View style={{ height: keyboardHeight || 280, backgroundColor: colors.background }}>
          <EmojiKeyboard
            onEmojiSelected={handleEmojiSelected}
            translation={emojiTranslation}
            enableRecentlyUsed
            enableSearchBar
            categoryPosition="top"
            enableCategoryChangeGesture
            theme={{
              knob: colors.textLight,
              container: colors.background,
              header: colors.text,
              category: {
                icon: colors.textSecondary,
                iconActive: colors.primary,
                container: colors.backgroundSecondary,
                containerActive: colors.primary + '20',
              },
              search: {
                background: colors.backgroundSecondary,
                text: colors.text,
                placeholder: colors.textLight,
                icon: colors.textSecondary,
              },
            }}
          />
        </View>
      )}
      </View>

      {/* Service report composition modal (caretaker only) */}
      {reportModalVisible && firebaseUser && id && (
        <ServiceReportModal
          visible={reportModalVisible}
          chatId={id}
          senderId={firebaseUser.uid}
          recipientId={recipientId}
          onClose={() => setReportModalVisible(false)}
          onSent={() => setReportModalVisible(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  msgList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  // Messages
  msgRow: {
    marginBottom: spacing.xs,
    maxWidth: '80%',
  },
  msgRowRight: { alignSelf: 'flex-end' },
  msgRowLeft:  { alignSelf: 'flex-start' },
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
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  },
  msgText: { fontSize: fontSize.md, lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextOther: { color: colors.text },
  msgTime: { fontSize: 10, marginTop: 3, alignSelf: 'flex-end' },
  msgTimeMe: { color: 'rgba(255,255,255,0.7)' },
  msgTimeOther: { color: colors.textLight },

  // Image message — edge-to-edge inside its own bubble
  imageBubble: {
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
    padding: 0,
  },
  msgImage: {
    width: 220,
    height: 220,
    borderRadius: 0,
  },
  imageTimeOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imageTime: {
    fontSize: 10,
    color: '#fff',
  },

  // File message
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 160,
  },
  fileIconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileIconBoxMe: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  fileName: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // Audio message
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 200,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  playBtnMe: { backgroundColor: 'rgba(255,255,255,0.25)' },
  playBtnOther: { backgroundColor: colors.primary },
  audioBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  // Larger transparent area surrounding the visible bar so dragging is easy
  progressHitArea: {
    height: 24,
    justifyContent: 'center',
    position: 'relative',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressTrackMe: { backgroundColor: 'rgba(255,255,255,0.3)' },
  progressTrackOther: { backgroundColor: colors.primary + '30' },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressFillMe: { backgroundColor: '#fff' },
  progressFillOther: { backgroundColor: colors.primary },
  progressThumb: {
    position: 'absolute',
    top: 6,           // (24 hit area - 12 thumb) / 2
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
  },
  progressThumbMe: { backgroundColor: '#fff' },
  progressThumbOther: { backgroundColor: colors.primary },
  progressThumbActive: {
    transform: [{ scale: 1.3 }],
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  audioTimeText: { fontSize: 11, fontWeight: '600' },

  // Input wrapper — normal flow, sits below FlatList
  inputWrapper: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  // Rounded pill that holds emoji + text + attach + camera
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.background,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 4,
    paddingVertical: Platform.OS === 'ios' ? 4 : 2,
    minHeight: 46,
  },
  pillIconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 120,
    paddingHorizontal: 2,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    lineHeight: 20,
  },
  // Circular action button (send / mic) — outside the pill
  actionCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionCircleBusy: {
    backgroundColor: colors.textLight,
  },

  // Recording bar
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  recordingTime: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.error,
    minWidth: 40,
  },
  recordingHint: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  recordingStop: {
    padding: spacing.xs,
  },

  // Attach menu — floats above input bar without pushing content
  attachMenu: {
    position: 'absolute',
    bottom: 70,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    zIndex: 10,
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 10,
    },
  },
  attachItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  attachIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '600',
  },

  // System chat banner
  systemBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  systemBannerText: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    fontStyle: 'italic',
  },
});
