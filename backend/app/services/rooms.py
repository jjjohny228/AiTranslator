from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

from fastapi import HTTPException

from app.schemas.rooms import (
    RoomCreateRequest,
    RoomMessage,
    RoomParticipant,
    RoomState,
    RoomTextMessageRequest,
    SpeakerKey,
)
from app.services.orchestrator import TranslatorOrchestrator


@dataclass
class RoomRecord:
    id: str
    participant_a: RoomParticipant
    participant_b: RoomParticipant
    mode: str
    synthesize_responses: bool
    created_at: float
    messages: list[RoomMessage] = field(default_factory=list)


class RoomService:
    def __init__(self) -> None:
        self._rooms: dict[str, RoomRecord] = {}

    def create_room(self, payload: RoomCreateRequest) -> RoomState:
        room_id = uuid.uuid4().hex[:8]
        record = RoomRecord(
            id=room_id,
            participant_a=payload.participant_a,
            participant_b=payload.participant_b,
            mode=payload.mode,
            synthesize_responses=payload.synthesize_responses,
            created_at=time.time(),
        )
        self._rooms[room_id] = record
        return self._to_state(record)

    def get_room(self, room_id: str) -> RoomState:
        return self._to_state(self._require_room(room_id))

    async def add_text_message(
        self,
        *,
        room_id: str,
        payload: RoomTextMessageRequest,
        orchestrator: TranslatorOrchestrator,
        voice_id: str | None = None,
    ) -> RoomMessage:
        room = self._require_room(room_id)
        source, target = self._resolve_participants(room, payload.speaker)
        response = await orchestrator.translate_text(
            text=payload.text,
            source_language=source.language,
            target_language=target.language,
            mode=room.mode,
            generate_audio=room.synthesize_responses,
            voice_id=voice_id,
        )
        message = RoomMessage(
            id=uuid.uuid4().hex[:12],
            kind="text",
            speaker=payload.speaker,
            speaker_name=source.name,
            target_name=target.name,
            source_language=source.language,
            target_language=target.language,
            original_text=response.source_text,
            translated_text=response.translated_text,
            detected_source_language=response.detected_source_language,
            status="done",
            audio_base64=response.audio_base64,
            audio_mime_type=response.audio_mime_type,
            created_at=time.time(),
        )
        room.messages.append(message)
        return message

    async def add_audio_message(
        self,
        *,
        room_id: str,
        speaker: SpeakerKey,
        audio_bytes: bytes,
        filename: str,
        orchestrator: TranslatorOrchestrator,
        voice_id: str | None = None,
    ) -> RoomMessage:
        room = self._require_room(room_id)
        source, target = self._resolve_participants(room, speaker)
        response = await orchestrator.translate_audio(
            audio_bytes=audio_bytes,
            filename=filename,
            source_language=source.language,
            target_language=target.language,
            mode=room.mode,
            generate_audio=room.synthesize_responses,
            voice_id=voice_id,
        )
        message = RoomMessage(
            id=uuid.uuid4().hex[:12],
            kind="audio",
            speaker=speaker,
            speaker_name=source.name,
            target_name=target.name,
            source_language=source.language,
            target_language=target.language,
            original_text=response.source_text,
            translated_text=response.translated_text,
            detected_source_language=response.detected_source_language,
            status="done",
            audio_base64=response.audio_base64,
            audio_mime_type=response.audio_mime_type,
            attachment_name=filename,
            created_at=time.time(),
        )
        room.messages.append(message)
        return message

    def update_room_preferences(
        self,
        *,
        room_id: str,
        mode: str | None = None,
        synthesize_responses: bool | None = None,
    ) -> RoomState:
        room = self._require_room(room_id)
        if mode is not None:
            room.mode = mode
        if synthesize_responses is not None:
            room.synthesize_responses = synthesize_responses
        return self._to_state(room)

    def _require_room(self, room_id: str) -> RoomRecord:
        room = self._rooms.get(room_id)
        if room is None:
            raise HTTPException(status_code=404, detail="Room not found.")
        return room

    def _resolve_participants(
        self,
        room: RoomRecord,
        speaker: SpeakerKey,
    ) -> tuple[RoomParticipant, RoomParticipant]:
        return (
            (room.participant_a, room.participant_b)
            if speaker == "a"
            else (room.participant_b, room.participant_a)
        )

    def _to_state(self, room: RoomRecord) -> RoomState:
        return RoomState(
            id=room.id,
            participant_a=room.participant_a,
            participant_b=room.participant_b,
            mode=room.mode,
            synthesize_responses=room.synthesize_responses,
            messages=list(room.messages),
            created_at=room.created_at,
        )


room_service = RoomService()
