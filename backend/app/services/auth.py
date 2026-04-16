from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException

from app.schemas.auth import UserResponse
from app.schemas.profile import VoiceProfileResponse


DB_PATH = Path(__file__).resolve().parents[2] / "app.db"


@dataclass
class UserRecord:
    id: str
    email: str
    display_name: str


class AuthService:
    def __init__(self) -> None:
        self._ensure_tables()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_tables(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS voice_profiles (
                    user_id TEXT PRIMARY KEY,
                    voice_id TEXT NOT NULL,
                    voice_name TEXT NOT NULL,
                    language TEXT NOT NULL,
                    gender TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )

    def register(self, *, email: str, password: str, display_name: str) -> tuple[str, UserResponse]:
        password_salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, password_salt)
        user_id = uuid.uuid4().hex
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, email.lower(), display_name, password_hash, password_salt, time.time()),
                )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="User with this email already exists.") from exc
        token = self._create_session(user_id)
        return token, UserResponse(id=user_id, email=email.lower(), display_name=display_name)

    def login(self, *, email: str, password: str) -> tuple[str, UserResponse]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, email, display_name, password_hash, password_salt
                FROM users
                WHERE email = ?
                """,
                (email.lower(),),
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        if not self._verify_password(password, row["password_salt"], row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = self._create_session(row["id"])
        return token, UserResponse(id=row["id"], email=row["email"], display_name=row["display_name"])

    def get_user_by_token(self, token: str) -> UserRecord:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT users.id, users.email, users.display_name
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ?
                """,
                (token,),
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="Authentication required.")
        return UserRecord(id=row["id"], email=row["email"], display_name=row["display_name"])

    def save_voice_profile(
        self,
        *,
        user_id: str,
        voice_id: str,
        voice_name: str,
        language: str,
        gender: str,
    ) -> VoiceProfileResponse:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO voice_profiles (user_id, voice_id, voice_name, language, gender, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    voice_id = excluded.voice_id,
                    voice_name = excluded.voice_name,
                    language = excluded.language,
                    gender = excluded.gender,
                    created_at = excluded.created_at
                """,
                (user_id, voice_id, voice_name, language, gender, time.time()),
            )
        return VoiceProfileResponse(
            status="ready",
            voice_id=voice_id,
            voice_name=voice_name,
            language=language,
            gender=gender,
        )

    def get_voice_profile(self, user_id: str) -> VoiceProfileResponse:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT voice_id, voice_name, language, gender
                FROM voice_profiles
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
        if row is None:
            return VoiceProfileResponse(status="missing")
        return VoiceProfileResponse(
            status="ready",
            voice_id=row["voice_id"],
            voice_name=row["voice_name"],
            language=row["language"],
            gender=row["gender"],
        )

    def _create_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                (token, user_id, time.time()),
            )
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
