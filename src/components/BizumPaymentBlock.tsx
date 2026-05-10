import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useHaptics } from '../hooks/useHaptics';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

interface Props {
  /** Bizum / phone number of the counterpart. Null/empty → fallback chat-only block. */
  phone: string | null | undefined;
  /** Counterpart UID — used to deep-link the chat. */
  counterpartUid: string;
  /** Counterpart display name — used as fallback in messages. */
  counterpartName: string;
  /** Informational EUR price to suggest in WhatsApp/chat copy. */
  priceEurInfo?: number;
}

/** Block shown to the booker (owner) AND the provider in a confirmed booking,
 *  exposing the off-platform payment number. Honest and explicit: the app does
 *  NOT process the payment. */
export default function BizumPaymentBlock({
  phone,
  counterpartUid,
  counterpartName,
  priceEurInfo,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const haptics = useHaptics();

  const openChat = () => {
    if (!firebaseUser) return;
    const chatId = [firebaseUser.uid, counterpartUid].sort().join('_');
    router.push(`/(shared)/chat/${chatId}`);
  };

  const copyNumber = async () => {
    if (!phone) return;
    try {
      await Clipboard.setStringAsync(phone);
      haptics.success();
      Alert.alert(t('bookings.bizum.copiedTitle'), t('bookings.bizum.copiedBody'));
    } catch {
      // Silent — Clipboard failures are extremely rare
    }
  };

  const openDialer = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert(t('common.error')));
  };

  const openWhatsApp = () => {
    if (!phone) return;
    // Strip non-digits + leading + and country prefix already in the number
    const cleaned = phone.replace(/\D/g, '');
    const text = priceEurInfo
      ? encodeURIComponent(t('bookings.bizum.whatsappPrefilled', { name: counterpartName, amount: priceEurInfo }))
      : '';
    const url = `https://wa.me/${cleaned}${text ? `?text=${text}` : ''}`;
    Linking.openURL(url).catch(() => Alert.alert(t('common.error')));
  };

  if (!phone) {
    return (
      <View style={styles.box}>
        <View style={styles.headerRow}>
          <Ionicons name="chatbubbles" size={20} color={colors.primary} />
          <Text style={styles.headerTitle}>{t('bookings.bizum.fallbackTitle')}</Text>
        </View>
        <Text style={styles.headerBody}>
          {t('bookings.bizum.fallbackBody', { name: counterpartName })}
        </Text>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={openChat}>
          <Ionicons name="chatbubble" size={16} color={colors.textOnPrimary} />
          <Text style={styles.btnPrimaryText}>{t('bookings.bizum.openChat')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <View style={styles.headerRow}>
        <View style={styles.bizumIcon}><Text style={styles.bizumIconText}>B</Text></View>
        <Text style={styles.headerTitle}>{t('bookings.bizum.title')}</Text>
      </View>
      {priceEurInfo != null && (
        <Text style={styles.amount}>{priceEurInfo} €</Text>
      )}
      <TouchableOpacity style={styles.phoneRow} onPress={copyNumber} activeOpacity={0.7}>
        <Text style={styles.phoneText}>{phone}</Text>
        <Ionicons name="copy-outline" size={16} color={colors.primary} />
      </TouchableOpacity>
      <Text style={styles.disclaimer}>{t('bookings.bizum.disclaimer')}</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={openDialer}>
          <Ionicons name="call" size={14} color={colors.primary} />
          <Text style={styles.btnSecondaryText}>{t('bookings.bizum.call')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={openWhatsApp}>
          <Ionicons name="logo-whatsapp" size={14} color={colors.primary} />
          <Text style={styles.btnSecondaryText}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={openChat}>
          <Ionicons name="chatbubble" size={14} color={colors.textOnPrimary} />
          <Text style={styles.btnPrimaryText}>{t('bookings.bizum.openChat')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const BIZUM_BLUE = '#00A6E5';

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: BIZUM_BLUE + '40',
    gap: 6,
    ...shadow.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bizumIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: BIZUM_BLUE,
    alignItems: 'center', justifyContent: 'center',
  },
  bizumIconText: { color: '#fff', fontWeight: '900', fontSize: fontSize.md, letterSpacing: -0.5 },
  headerTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  headerBody: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  amount: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -1 },

  phoneRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: BIZUM_BLUE + '10',
  },
  phoneText: {
    fontSize: fontSize.lg, fontWeight: '800', color: BIZUM_BLUE,
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'] as any,
  },
  disclaimer: { fontSize: fontSize.xs, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },

  actionsRow: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 8,
    borderRadius: borderRadius.full, flex: 1, minWidth: 88,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.xs },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary },
  btnSecondaryText: { color: colors.primary, fontWeight: '800', fontSize: fontSize.xs },
});
