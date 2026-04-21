from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db import get_db_session
from app.models import SessionToken, User, VoiceProfile
from app.schemas.auth import UserResponse
from app.schemas.profile import VoiceProfileResponse


@dataclass
class UserRecord:
    id: str
    email: str
    display_name: str
    ui_language: str | None = None


class AuthService:
    def register(self, *, email: str, password: str, display_name: str) -> tuple[str, UserResponse]:
        password_salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, password_salt)
        user = User(
            id=uuid.uuid4().hex,
            email=email.lower(),
            display_name=display_name,
            password_hash=password_hash,
            password_salt=password_salt,
            created_at=time.time(),
        )
        try:
            with get_db_session() as session:
                session.add(user)
        except IntegrityError as exc:
            raise HTTPException(status_code=409, detail="User with this email already exists.") from exc
        token = self._create_session(user.id)
        return token, UserResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            ui_language=user.ui_language,
        )

    def login(self, *, email: str, password: str) -> tuple[str, UserResponse]:
        with get_db_session() as session:
            user = session.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        if not self._verify_password(password, user.password_salt, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = self._create_session(user.id)
        return token, UserResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            ui_language=user.ui_language,
        )

    def get_user_by_token(self, token: str) -> UserRecord:
        with get_db_session() as session:
            session_token = session.scalar(select(SessionToken).where(SessionToken.token == token))
            if session_token is None or session_token.user is None:
                raise HTTPException(status_code=401, detail="Authentication required.")
            user = session_token.user
            return UserRecord(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                ui_language=user.ui_language,
            )

    def update_user_preferences(self, *, user_id: str, ui_language: str | None) -> UserResponse:
        normalized_language = ui_language or None
        with get_db_session() as session:
            user = session.get(User, user_id)
            if user is None:
                raise HTTPException(status_code=404, detail="User not found.")
            user.ui_language = normalized_language
            return UserResponse(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                ui_language=user.ui_language,
            )

    def save_voice_profile(
        self,
        *,
        user_id: str,
        voice_id: str,
        voice_name: str,
        language: str,
        gender: str,
    ) -> VoiceProfileResponse:
        with get_db_session() as session:
            profile = session.get(VoiceProfile, user_id)
            if profile is None:
                profile = VoiceProfile(
                    user_id=user_id,
                    voice_id=voice_id,
                    voice_name=voice_name,
                    language=language,
                    gender=gender,
                    created_at=time.time(),
                )
                session.add(profile)
            else:
                profile.voice_id = voice_id
                profile.voice_name = voice_name
                profile.language = language
                profile.gender = gender
                profile.created_at = time.time()

        return VoiceProfileResponse(
            status="ready",
            voice_id=voice_id,
            voice_name=voice_name,
            language=language,
            gender=gender,
        )

    def get_voice_profile(self, user_id: str) -> VoiceProfileResponse:
        with get_db_session() as session:
            profile = session.get(VoiceProfile, user_id)
        if profile is None:
            return VoiceProfileResponse(status="missing")
        return VoiceProfileResponse(
            status="ready",
            voice_id=profile.voice_id,
            voice_name=profile.voice_name,
            language=profile.language,
            gender=profile.gender,
        )

    def _create_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        with get_db_session() as session:
            session.add(SessionToken(token=token, user_id=user_id, created_at=time.time()))
        return token

    def _hash_password(self, password: str, salt: str) -> str:
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            120_000,
        )
        return digest.hex()

    def _verify_password(self, password: str, salt: str, expected_hash: str) -> bool:
        actual_hash = self._hash_password(password, salt)
        return hmac.compare_digest(actual_hash, expected_hash)


auth_service = AuthService()
