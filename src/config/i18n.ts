import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import es from '../locales/es.json';

const SUPPORTED = ['es', 'en', 'fr', 'pt', 'de'] as const;
type SupportedLang = typeof SUPPORTED[number];

// Lazy loaders keyed by language. Each `import()` is a literal path so the
// Metro bundler can treat each locale as its own chunk instead of inlining
// the full 1.6MB bag into the initial bundle. Spanish is always present
// (static import above) because it is the fallback and most common default.
const localeLoaders: Record<Exclude<SupportedLang, 'es'>, () => Promise<any>> = {
  en: () => import('../locales/en.json'),
  fr: () => import('../locales/fr.json'),
  pt: () => import('../locales/pt.json'),
  de: () => import('../locales/de.json'),
};

/**
 * Lazily fetch a locale bundle and register it with i18next. No-op for
 * Spanish (always bundled) and for unsupported languages.
 *
 * Safe to call multiple times — second call short-circuits via
 * `hasResourceBundle`.
 */
export async function loadLocale(lang: string): Promise<void> {
  if (lang === 'es') return;
  if (i18n.hasResourceBundle(lang, 'translation')) return;
  const loader = localeLoaders[lang as keyof typeof localeLoaders];
  if (!loader) return;
  try {
    const mod = await loader();
    i18n.addResourceBundle(lang, 'translation', mod.default ?? mod);
  } catch (err) {
    // Non-fatal — i18next will fall back to Spanish.
    console.warn(`Failed to load locale ${lang}:`, err);
  }
}

/**
 * Load the locale (if not already in memory) then switch i18next to it.
 * Always prefer this over `i18n.changeLanguage(lang)` directly — otherwise
 * the bundle for that language never gets fetched and the user sees the
 * fallback Spanish text.
 */
export async function setLanguage(lang: string): Promise<void> {
  await loadLocale(lang);
  await i18n.changeLanguage(lang);
}

// Detect device language, fallback to Spanish
const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'es';
const defaultLang: SupportedLang = (SUPPORTED as readonly string[]).includes(deviceLang)
  ? (deviceLang as SupportedLang)
  : 'es';

i18n.use(initReactI18next).init({
  resources: { es: { translation: es } },
  // Start in Spanish synchronously so first-render strings always resolve;
  // the device's preferred language (if different) loads asynchronously
  // below. May produce a one-frame flash of Spanish on first launch for
  // non-Spanish device defaults — acceptable trade-off vs the 1.6MB
  // startup bloat the old eager import caused.
  lng: 'es',
  fallbackLng: 'es',
  compatibilityJSON: 'v3',
  interpolation: { escapeValue: false },
});

if (defaultLang !== 'es') {
  setLanguage(defaultLang).catch(() => {});
}

export default i18n;
