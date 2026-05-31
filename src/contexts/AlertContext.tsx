import React, { createContext, useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AlertModal, { AlertButton } from '../components/ui/AlertModal';

/**
 * Imperative styled-alert provider.
 *
 * `showAlert(title, message?, buttons?)` mirrors the signature of React
 * Native's `Alert.alert`, so call sites migrate with a near drop-in rename.
 * When no buttons are passed it defaults to a single localized "OK".
 *
 * Mount once above the screens that should use it (currently
 * app/(auth)/_layout.tsx). To extend coverage to the whole app later, lift the
 * provider to the root app/_layout.tsx — no call-site changes needed.
 */
type ShowAlert = (title: string, message?: string, buttons?: AlertButton[]) => void;

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

const AlertContext = createContext<{ showAlert: ShowAlert } | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<AlertState>({
    visible: false,
    title: '',
    message: undefined,
    buttons: [],
  });

  const showAlert = useCallback<ShowAlert>(
    (title, message, buttons) => {
      const resolved =
        buttons && buttons.length > 0 ? buttons : [{ text: t('common.ok') }];
      setState({ visible: true, title, message, buttons: resolved });
    },
    [t],
  );

  const close = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  const handleButtonPress = useCallback(
    (button: AlertButton) => {
      close();
      button.onPress?.();
    },
    [close],
  );

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AlertModal
        visible={state.visible}
        title={state.title}
        message={state.message}
        buttons={state.buttons}
        onRequestClose={close}
        onButtonPress={handleButtonPress}
      />
    </AlertContext.Provider>
  );
}

export function useAppAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAppAlert must be used within an AlertProvider');
  }
  return ctx;
}
