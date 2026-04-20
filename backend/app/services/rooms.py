from __future__ import annotations

import time
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import get_db_session
from app.models import Room, RoomMessageModel
from app.schemas.rooms import (
    RoomCreateRequest,
    RoomMessage,
    RoomParticipant,
    RoomState,
    RoomTextMessageRequest,
    SpeakerKey,
)
from app.services.orchestrator import TranslatorOrchestrator


class RoomService:
    def create_room(self, payload: RoomCreateRequest) -> RoomState:
        room = Room(
            id=uuid.uuid4().hex[:8],
            participant_a_name=payload.participant_a.name,
            participant_a_language=payload.participant_a.language,
            participant_a_gender=payload.participant_a.gender,
            participant_b_name=payload.participant_b.name,
            participant_b_language=payload.participant_b.language,
            participant_b_gender=payload.participant_b.gender,
            mode=payload.mode,
            synthesize_responses=payload.synthesize_responses,
            created_at=time.time(),
        )
        with get_db_session() as session:
            session.add(room)
        return self.get_room(room.id)

    def get_room(self, room_id: str) -> RoomState:
        with get_db_session() as session:
            room = self._require_room(session, room_id)
            return self._to_state(room)

    async def add_text_message(
        self,
        *,
        room_id: str,
        payload: RoomTextMessageRequest,
        orchestrator: TranslatorOrchestrator,
        voice_id: str | None = None,
    ) -> RoomMessage:
        with get_db_session() as session:
            room = self._require_room(session, room_id)
            source, target = self._resolve_participants(room, payload.speaker)

        response = await orchestrator.translate_text(
            text=payload.text,
            source_language=source.language,
            target_language=target.language,
            mode=room.mode,
            generate_audio=room.synthesize_responses,
            voice_id=voice_id,
        )
        message = RoomMessageModel(
            id=uuid.uuid4().hex[:12],
            room_id=room_id,
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
        with get_db_session() as session:
            session.add(message)
        return self._to_message(message)

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
        with get_db_session() as session:
            room = self._require_room(session, room_id)
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
        message = RoomMessageModel(
            id=uuid.uuid4().hex[:12],
            room_id=room_id,
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
        with get_db_session() as session:
            session.add(message)
        return self._to_message(message)

    def update_room_preferences(
        self,
        *,
        room_id: str,
        mode: str | None = None,
        synthesize_responses: bool | None = None,
    ) -> RoomState:
        with get_db_session() as session:
            room = self._require_room(session, room_id)
            if mode is not None:
                room.mode = mode
            if synthesize_responses is not None:
                room.synthesize_responses = synthesize_responses
            session.flush()
            session.refresh(room)
            return self._to_state(room)

    def _require_room(self, session, room_id: str) -> Room:
        room = session.scalar(
            select(Room)
            .options(selectinload(Room.messages))
            .where(Room.id == room_id)
        )
        if room is None:
            raise HTTPException(status_code=404, detail="Room not found.")
        return room

    def _resolve_participants(
        self,
        room: Room,
        speaker: SpeakerKey,
    ) -> tuple[RoomParticipant, RoomParticipant]:
        participant_a = RoomParticipant(
            name=room.participant_a_name,
            language=room.participant_a_language,
            gender=room.participant_a_gender,
        )
        participant_b = RoomParticipant(
            name=room.participant_b_name,
            language=room.participant_b_language,
            gender=room.participant_b_gender,
        )
        return (participant_a, participant_b) if speaker == "a" else (participant_b, participant_a)

    def _to_message(self, message: RoomMessageModel) -> RoomMessage:
        return RoomMessage(
            id=message.id,
            kind=message.kind,
            speaker=message.speaker,
            speaker_name=message.speaker_name,
            target_name=message.target_name,
            source_language=message.source_language,
            target_language=message.target_language,
            original_text=message.original_text,
            translated_text=message.translated_text,
            detected_source_language=message.detected_source_language,
            status=message.status,
            audio_base64=message.audio_base64,
            audio_mime_type=message.audio_mime_type,
            attachment_name=message.attachment_name,
            created_at=message.created_at,
            error_detail=message.error_detail,
        )

    def _to_state(self, room: Room) -> RoomState:
        return RoomState(
            id=room.id,
            participant_a=RoomParticipant(
                name=room.participant_a_name,
                language=room.participant_a_language,
                gender=room.participant_a_gender,
            ),
            participant_b=RoomParticipant(
                name=room.participant_b_name,
                language=room.participant_b_language,
                gender=room.participant_b_gender,
            ),
            mode=room.mode,
            synthesize_responses=room.synthesize_responses,
            messages=[self._to_message(message) for message in sorted(room.messages, key=lambda item: item.created_at)],
            created_at=room.created_at,
        )


room_service = RoomService()
