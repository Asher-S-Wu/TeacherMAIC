import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { supportedLocales } from './locales';
import { defaultLocale } from './types';
import zhCN from './locales/zh-CN.json';

const resources = {
  'zh-CN': { translation: zhCN },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: defaultLocale,
    fallbackLng: defaultLocale,
    supportedLngs: supportedLocales.map((l) => l.code),
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
