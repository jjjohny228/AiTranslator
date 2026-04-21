import { LANGUAGE_TO_LOCALE, LOCALE_MESSAGES } from "./resources";

export function resolvePreferredLocale() {
  if (typeof navigator === "undefined") {
    return "en";
  }
  const browserLanguage = (navigator.language || "en").toLowerCase();
  if (browserLanguage.startsWith("uk")) return "uk";
  if (browserLanguage.startsWith("ru")) return "ru";
  if (browserLanguage.startsWith("de")) return "de";
  if (browserLanguage.startsWith("es")) return "es";
  if (browserLanguage.startsWith("fr")) return "fr";
  if (browserLanguage.startsWith("pl")) return "pl";
  return "en";
}

export function resolveLocaleForLanguage(language, fallback = "en") {
  const nextLocale = LANGUAGE_TO_LOCALE[language] ?? fallback;
  return LOCALE_MESSAGES[nextLocale] ? nextLocale : "en";
}

