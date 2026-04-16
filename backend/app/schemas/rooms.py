from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.translator import TranslationMode


SpeakerKey = Literal["a", "b"]
MessageKind = Literal["text", "audio"]
MessageStatus = Literal["done", "error"]
ParticipantGender = Literal["male", "female"]


class RoomParticipant(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    language: str = Field(min_length=2, max_length=64)
    gender: ParticipantGender = "male"


class RoomCreateRequest(BaseModel):
    participant_a: RoomParticipant
    participant_b: RoomParticipant
    mode: TranslationMode = "balanced"
    synthesize_responses: bool = False


class RoomMessage(BaseModel):
    id: str
    kind: MessageKind
    speaker: SpeakerKey
    speaker_name: str
    target_name: str
    source_language: str
    target_language: str
    original_text: str
    translated_text: str
    detected_source_language: str
    status: MessageStatus
    audio_base64: str | None = None
    audio_mime_type: str | None = None
    attachment_name: str | None = None
    created_at: float
    error_detail: str | None = None


class RoomState(BaseModel):
    id: str
    participant_a: RoomParticipant
    participant_b: RoomParticipant
    mode: TranslationMode
    synthesize_responses: bool
    messages: list[RoomMessage]
    created_at: float


class RoomTextMessageRequest(BaseModel):
    speaker: SpeakerKey
    text: str = Field(min_length=1, max_length=10_000)
