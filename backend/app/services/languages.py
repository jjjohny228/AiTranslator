LANGUAGE_TO_ISO_639_1 = {
    "auto": None,
    "english": "en",
    "ukrainian": "uk",
    "russian": "ru",
    "german": "de",
    "spanish": "es",
    "french": "fr",
    "polish": "pl",
}


def to_iso_639_1(language: str | None) -> str | None:
    if not language:
        return None
    normalized = language.strip().lower()
    if not normalized:
        return None
    if len(normalized) == 2:
        return normalized
    return LANGUAGE_TO_ISO_639_1.get(normalized)
