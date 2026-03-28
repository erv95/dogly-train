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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getDogsByOwner, deleteDog } from '../../src/services/dogs';
import { Card } from '../../src/components/ui';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../src/theme';
import { Dog } from '../../src/types';

export default function DogsScreen() {
  const { t } = useTranslation();
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDogs = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const result = await getDogsByOwner(firebaseUser.uid);
      setDogs(result);
    } catch (error) {
      console.error('Error loading dogs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useFocusEffect(
    useCallback(() => {
      loadDogs();
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
            } catch (error) {
              Alert.alert(t('common.error'), t('authErrors.generic'));
            }
          },
        },
      ]
    );
  };

  const renderDogCard = ({ item }: { item: Dog }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push(`/(shared)/dog-form?dogId=${item.id}`)}
    >
      <Card style={styles.dogCard}>
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.dogPhoto} />
        ) : (
          <View style={styles.dogPhotoPlaceholder}>
            <Ionicons name="paw" size={32} color={colors.textLight} />
          </View>
        )}
        <View style={styles.dogInfo}>
          <Text style={styles.dogName}>{item.name}</Text>
          <Text style={styles.dogBreed}>{item.breed}</Text>
          <Text style={styles.dogDetails}>
            {item.age} {t('dogs.age').toLowerCase()} · {item.weight} kg
          </Text>
          {item.issues.length > 0 && (
            <View style={styles.issuesTags}>
              {item.issues.slice(0, 3).map((issue) => (
                <View key={issue} style={styles.issueTag}>
                  <Text style={styles.issueTagText}>
                    {t(`dogs.issueOptions.${issue}`)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </Card>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="paw-outline" size={64} color={colors.textLight} />
      <Text style={styles.emptyText}>{t('dogs.noDogs')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('owner.myDogs')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/(shared)/dog-form')}
        >
          <Ionicons name="add" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={dogs}
        keyExtractor={(item) => item.id}
        renderItem={renderDogCard}
        contentContainerStyle={dogs.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={loading ? null : renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadDogs();
            }}
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
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
  dogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dogPhoto: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
  },
  dogPhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dogInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  dogName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  dogBreed: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  dogDetails: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  issuesTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.xs,
  },
  issueTag: {
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  issueTagText: {
    fontSize: fontSize.xs,
    color: colors.warning,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: spacing.sm,
  },
});
