import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { LOCALE_MESSAGES } from "./resources";
import { resolvePreferredLocale } from "./utils";

const resources = Object.fromEntries(
  Object.entries(LOCALE_MESSAGES).map(([locale, messages]) => [
    locale,
    {
      translation: {
        ...messages.ui,
        languages: messages.languages,
        genders: messages.genders,
      },
    },
  ]),
);

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: resolvePreferredLocale(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;

