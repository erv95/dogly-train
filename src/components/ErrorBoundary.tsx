import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import i18n from '../config/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleRestart = () => {
    this.setState({ hasError: false });
    // Navigate somewhere safe instead of just re-rendering the screen that threw
    // (which would immediately re-crash and re-blank). The index gate at '/'
    // re-routes to the right home for the user's role. Guarded in case the
    // navigator isn't mounted yet — clearing hasError already happened above.
    try {
      router.replace('/');
    } catch {
      // navigator not ready — state reset is enough
    }
  };

  render() {
    if (this.state.hasError) {
      const t = (key: string) => i18n.t(key);
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>:(</Text>
          <Text style={styles.title}>{t('common.crashTitle')}</Text>
          <Text style={styles.message}>{t('common.crashMessage')}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRestart} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{t('common.restart')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.lg,
    color: colors.textLight,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.md,
  },
});
