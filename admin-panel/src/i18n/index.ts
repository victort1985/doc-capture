import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ru from './locales/ru.json';
import he from './locales/he.json';

const STORAGE_KEY = 'vixor-admin-lang';
const RTL_LANGS = ['he'];

export function applyDocumentDirection(lang: string) {
  document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

const savedLang = localStorage.getItem(STORAGE_KEY) || 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru }, he: { translation: he } },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

applyDocumentDirection(savedLang);

i18n.on('languageChanged', (lang) => {
  localStorage.setItem(STORAGE_KEY, lang);
  applyDocumentDirection(lang);
});

export default i18n;
