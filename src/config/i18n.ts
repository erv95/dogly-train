import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import es from '../locales/es.json';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import pt from '../locales/pt.json';
import de from '../locales/de.json';

const resources = {
  es: { translation: es },
  en: { translation: en },
  fr: { translation: fr },
  pt: { translation: pt },
  de: { translation: de },
};

// Detect device language, fallback to Spanish
const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'es';
const supportedLangs = ['es', 'en', 'fr', 'pt', 'de'];
const defaultLang = supportedLangs.includes(deviceLang) ? deviceLang : 'es';

i18n.use(initReactI18next).init({
  resources,
  lng: defaultLang,
  fallbackLng: 'es',
  compatibilityJSON: 'v3',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
