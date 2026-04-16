from typing import Literal

from pydantic import BaseModel, Field


TranslationMode = Literal["balanced", "literal", "natural"]


class TextTranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)
    source_language: str = Field(default="auto")
    target_language: str = Field(min_length=2, max_length=64)
    mode: TranslationMode = "balanced"
    generate_audio: bool = False


class TranslationResponse(BaseModel):
    detected_source_language: str
    source_text: str
    translated_text: str
    mode: TranslationMode
    audio_base64: str | None = None
    audio_mime_type: str | None = None


class HealthResponse(BaseModel):
    status: str

