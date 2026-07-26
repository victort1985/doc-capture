import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ru from './locales/ru.json';
import he from './locales/he.json';
import ar from './locales/ar.json';

const STORAGE_KEY = 'vixor-admin-lang';
const RTL_LANGS = ['he', 'ar'];

export function applyDocumentDirection(lang: string) {
  document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

const savedLang = localStorage.getItem(STORAGE_KEY) || 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru }, he: { translation: he }, ar: { translation: ar } },
  lng: savedLang,
  // Arabic (ar.json) only covers nav/common/login so far — everything
  // else falls through to English rather than showing raw i18n keys,
  // until the rest of the app's ~500 keys get a proper translation
  // pass (machine-translating all of them by hand here risked more
  // wrong Arabic than a partial-but-correct starting set).
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

applyDocumentDirection(savedLang);

i18n.on('languageChanged', (lang) => {
  localStorage.setItem(STORAGE_KEY, lang);
  applyDocumentDirection(lang);
});

export default i18n;
