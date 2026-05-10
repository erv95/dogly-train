import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import BookingsListView from '../../src/components/BookingsListView';
import { colors, spacing, fontSize } from '../../src/theme';

export default function TrainerBookingsScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('bookings.list.title')}</Text>
      </View>
      <BookingsListView />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, alignItems: 'center' },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
});
