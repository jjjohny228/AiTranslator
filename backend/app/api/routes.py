import logging

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile

from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.schemas.profile import VoiceProfileResponse, VoiceScriptResponse
from app.schemas.rooms import RoomCreateRequest, RoomState, RoomTextMessageRequest
from app.core.config import get_settings
from app.schemas.translator import HealthResponse, TextTranslationRequest, TranslationResponse
from app.services.auth import UserRecord, auth_service
from app.services.orchestrator import TranslatorOrchestrator
from app.services.rooms import room_service
from app.services.voice_training import get_voice_script, voice_training_service


router = APIRouter()
settings = get_settings()
ALLOWED_MODES = {"balanced", "literal", "natural"}
logger = logging.getLogger(__name__)


def _validate_api_keys() -> None:
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured.")


def _validate_mode(mode: str) -> None:
    if mode not in ALLOWED_MODES:
        raise HTTPException(status_code=422, detail=f"Unsupported mode: {mode}")


def _get_orchestrator() -> TranslatorOrchestrator:
    return TranslatorOrchestrator()


def _token_from_header(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    return authorization.split(" ", 1)[1]


def get_current_user(authorization: str | None = Header(default=None)) -> UserRecord:
    token = _token_from_header(authorization)
    return auth_service.get_user_by_token(token)


def get_current_user_optional(authorization: str | None = Header(default=None)) -> UserRecord | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        return auth_service.get_user_by_token(token)
    except HTTPException:
        return None


@router.get("/health", response_model=HealthResponse)
async def healthcheck() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/auth/register", response_model=AuthResponse)
async def register(payload: RegisterRequest) -> AuthResponse:
    token, user = auth_service.register(
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
    )
    return AuthResponse(token=token, user=user)


@router.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest) -> AuthResponse:
    token, user = auth_service.login(email=payload.email, password=payload.password)
    return AuthResponse(token=token, user=user)


@router.get("/auth/me", response_model=UserResponse)
async def me(current_user: UserRecord = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
    )


@router.get("/profile/voice-script", response_model=VoiceScriptResponse)
async def voice_script(
    language: str,
    current_user: UserRecord = Depends(get_current_user),
) -> VoiceScriptResponse:
    _ = current_user
    return get_voice_script(language)


@router.get("/profile/voice", response_model=VoiceProfileResponse)
async def get_voice_profile(current_user: UserRecord = Depends(get_current_user)) -> VoiceProfileResponse:
    return auth_service.get_voice_profile(current_user.id)


@router.post("/profile/voice", response_model=VoiceProfileResponse)
async def create_voice_profile(
    language: str = Form(...),
    gender: str = Form(...),
    files: list[UploadFile] = File(...),
    current_user: UserRecord = Depends(get_current_user),
) -> VoiceProfileResponse:
    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY is not configured.")
    prepared_files: list[tuple[str, bytes, str]] = []
    for file in files:
        content = await file.read()
        if not content:
            continue
        prepared_files.append((file.filename or "voice-sample.webm", content, file.content_type or "audio/webm"))
    if not prepared_files:
        raise HTTPException(status_code=422, detail="At least one voice sample is required.")

    voice_name = f"{current_user.display_name} Lingua Voice"
    voice_id = await voice_training_service.create_instant_voice_clone(
        api_key=settings.elevenlabs_api_key,
        voice_name=voice_name,
        language=language,
        gender=gender,
        files=prepared_files,
    )
    return auth_service.save_voice_profile(
        user_id=current_user.id,
        voice_id=voice_id,
        voice_name=voice_name,
        language=language,
        gender=gender,
    )


@router.post("/rooms", response_model=RoomState)
async def create_room(payload: RoomCreateRequest) -> RoomState:
    return room_service.create_room(payload)


@router.get("/rooms/{room_id}", response_model=RoomState)
async def get_room(room_id: str) -> RoomState:
    return room_service.get_room(room_id)


@router.patch("/rooms/{room_id}", response_model=RoomState)
async def update_room_preferences(
    room_id: str,
    mode: str = Form(...),
    synthesize_responses: bool = Form(...),
) -> RoomState:
    _validate_mode(mode)
    return room_service.update_room_preferences(
        room_id=room_id,
        mode=mode,
        synthesize_responses=synthesize_responses,
    )


@router.post("/rooms/{room_id}/messages/text")
async def create_room_text_message(
    room_id: str,
    payload: RoomTextMessageRequest,
    current_user: UserRecord | None = Depends(get_current_user_optional),
):
    _validate_api_keys()
    orchestrator = _get_orchestrator()
    voice_profile = auth_service.get_voice_profile(current_user.id) if current_user else None
    try:
        return await room_service.add_text_message(
            room_id=room_id,
            payload=payload,
            orchestrator=orchestrator,
            voice_id=voice_profile.voice_id if voice_profile and voice_profile.status == "ready" else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Room text message failed")
        raise HTTPException(status_code=500, detail=f"Room text message failed: {exc}") from exc


@router.post("/rooms/{room_id}/messages/audio")
async def create_room_audio_message(
    room_id: str,
    file: UploadFile = File(...),
    speaker: str = Form(...),
    current_user: UserRecord | None = Depends(get_current_user_optional),
):
    _validate_api_keys()
    if speaker not in {"a", "b"}:
        raise HTTPException(status_code=422, detail="Speaker must be 'a' or 'b'.")
    orchestrator = _get_orchestrator()
    voice_profile = auth_service.get_voice_profile(current_user.id) if current_user else None
    audio_bytes = await file.read()
    max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(audio_bytes) > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file is too large. Max size is {settings.max_upload_size_mb} MB.",
        )
    try:
        return await room_service.add_audio_message(
            room_id=room_id,
            speaker=speaker,
            audio_bytes=audio_bytes,
            filename=file.filename or "audio-message.webm",
            orchestrator=orchestrator,
            voice_id=voice_profile.voice_id if voice_profile and voice_profile.status == "ready" else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Room audio message failed")
        raise HTTPException(status_code=500, detail=f"Room audio message failed: {exc}") from exc


@router.post("/translate/text", response_model=TranslationResponse)
async def translate_text(payload: TextTranslationRequest) -> TranslationResponse:
    _validate_api_keys()
    _validate_mode(payload.mode)
    if payload.generate_audio and not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY is not configured.")
    orchestrator = _get_orchestrator()
    try:
        return await orchestrator.translate_text(
            text=payload.text,
            source_language=payload.source_language,
            target_language=payload.target_language,
            mode=payload.mode,
            generate_audio=payload.generate_audio,
            voice_id=None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Text translation failed")
        raise HTTPException(status_code=500, detail=f"Text translation failed: {exc}") from exc


@router.post("/translate/audio", response_model=TranslationResponse)
async def translate_audio(
    file: UploadFile = File(...),
    source_language: str = Form("auto"),
    target_language: str = Form(...),
    mode: str = Form("balanced"),
    generate_audio: bool = Form(False),
) -> TranslationResponse:
    _validate_api_keys()
    _validate_mode(mode)
    if generate_audio and not settings.elevenlabs_api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY is not configured.")
    orchestrator = _get_orchestrator()

    audio_bytes = await file.read()
    max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(audio_bytes) > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file is too large. Max size is {settings.max_upload_size_mb} MB.",
        )

    try:
        return await orchestrator.translate_audio(
            audio_bytes=audio_bytes,
            filename=file.filename or "audio-message.webm",
            source_language=source_language,
            target_language=target_language,
            mode=mode,
            generate_audio=generate_audio,
            voice_id=None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Audio translation failed")
        raise HTTPException(status_code=500, detail=f"Audio translation failed: {exc}") from exc
