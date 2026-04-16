from typing import Literal

from pydantic import BaseModel

from app.schemas.rooms import ParticipantGender


VoiceProfileStatus = Literal["missing", "ready"]


class VoiceScriptResponse(BaseModel):
    language: str
    recommended_seconds: int
    instructions: str
    passages: list[str]


class VoiceProfileResponse(BaseModel):
    status: VoiceProfileStatus
    voice_id: str | None = None
    voice_name: str | None = None
    language: str | None = None
    gender: ParticipantGender | None = None

