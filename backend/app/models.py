from sqlalchemy import Boolean, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    password_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)

    sessions: Mapped[list["SessionToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    voice_profile: Mapped["VoiceProfile"] = relationship(back_populates="user", cascade="all, delete-orphan")


class SessionToken(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)

    user: Mapped[User] = relationship(back_populates="sessions")


class VoiceProfile(Base):
    __tablename__ = "voice_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    voice_id: Mapped[str] = mapped_column(String(255), nullable=False)
    voice_name: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str] = mapped_column(String(64), nullable=False)
    gender: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)

    user: Mapped[User] = relationship(back_populates="voice_profile")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(8), primary_key=True)
    participant_a_name: Mapped[str] = mapped_column(String(80), nullable=False)
    participant_a_language: Mapped[str] = mapped_column(String(64), nullable=False)
    participant_a_gender: Mapped[str] = mapped_column(String(32), nullable=False)
    participant_b_name: Mapped[str] = mapped_column(String(80), nullable=False)
    participant_b_language: Mapped[str] = mapped_column(String(64), nullable=False)
    participant_b_gender: Mapped[str] = mapped_column(String(32), nullable=False)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    synthesize_responses: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)

    messages: Mapped[list["RoomMessageModel"]] = relationship(
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="RoomMessageModel.created_at",
    )


class RoomMessageModel(Base):
    __tablename__ = "room_messages"

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    speaker: Mapped[str] = mapped_column(String(1), nullable=False)
    speaker_name: Mapped[str] = mapped_column(String(80), nullable=False)
    target_name: Mapped[str] = mapped_column(String(80), nullable=False)
    source_language: Mapped[str] = mapped_column(String(64), nullable=False)
    target_language: Mapped[str] = mapped_column(String(64), nullable=False)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    detected_source_language: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    audio_base64: Mapped[str] = mapped_column(Text, nullable=True)
    audio_mime_type: Mapped[str] = mapped_column(String(128), nullable=True)
    attachment_name: Mapped[str] = mapped_column(String(255), nullable=True)
    error_detail: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)

    room: Mapped[Room] = relationship(back_populates="messages")
