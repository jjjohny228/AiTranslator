from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.core.config import get_settings


SYSTEM_PROMPT = """You are an expert translator for chat and voice messages.
Return accurate translations while preserving meaning, names, intent, and tone.
If the source language is set to auto, detect it first.
Do not add commentary, explanations, or quotes around the answer.
Respond with only the translated text."""


MODE_GUIDANCE = {
    "balanced": "Preserve meaning and natural phrasing equally.",
    "literal": "Stay as close as possible to the original phrasing.",
    "natural": "Optimize for fluent native phrasing while preserving intent.",
}


class TranslationService:
    def __init__(self) -> None:
        settings = get_settings()
        self.model = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            timeout=settings.request_timeout_seconds,
        )

    async def translate(
        self,
        *,
        text: str,
        source_language: str,
        target_language: str,
        mode: str,
    ) -> tuple[str, str]:
        source_hint = (
            "Detect the input language automatically."
            if source_language.lower() == "auto"
            else f"The source language is {source_language}."
        )
        prompt = (
            f"{source_hint} Translate the text into {target_language}. "
            f"{MODE_GUIDANCE[mode]} "
            "On the first line output the detected source language. "
            "On the second line output the translation only.\n\n"
            f"Text:\n{text}"
        )
        response = await self.model.ainvoke(
            [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ]
        )
        lines = [line.strip() for line in response.content.splitlines() if line.strip()]
        if len(lines) >= 2:
            detected_language = lines[0]
            translated_text = "\n".join(lines[1:])
            return detected_language, translated_text

        fallback_language = source_language if source_language != "auto" else "unknown"
        return fallback_language, str(response.content).strip()
