from app.schemas.translator import TranslationResponse
from app.services.speech import SpeechService
from app.services.transcription import TranscriptionService
from app.services.translation import TranslationService


class TranslatorOrchestrator:
    def __init__(self) -> None:
        self.translation_service = TranslationService()
        self.transcription_service = TranscriptionService()
        self.speech_service = SpeechService()

    async def translate_text(
        self,
        *,
        text: str,
        source_language: str,
        target_language: str,
        mode: str,
        generate_audio: bool,
        voice_id: str | None = None,
    ) -> TranslationResponse:
        detected_language, translated_text = await self.translation_service.translate(
            text=text,
            source_language=source_language,
            target_language=target_language,
            mode=mode,
        )
        audio_base64 = None
        audio_mime_type = None
        if generate_audio:
            audio_base64, audio_mime_type = await self.speech_service.synthesize(
                text=translated_text,
                voice_id=voice_id,
            )

        return TranslationResponse(
            detected_source_language=detected_language,
            source_text=text,
            translated_text=translated_text,
            mode=mode,
            audio_base64=audio_base64,
            audio_mime_type=audio_mime_type,
        )

    async def translate_audio(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        source_language: str,
        target_language: str,
        mode: str,
        generate_audio: bool,
        voice_id: str | None = None,
    ) -> TranslationResponse:
        transcribed_text = await self.transcription_service.transcribe(
            content=audio_bytes,
            filename=filename,
            language=source_language,
        )
        return await self.translate_text(
            text=transcribed_text,
            source_language=source_language,
            target_language=target_language,
            mode=mode,
            generate_audio=generate_audio,
            voice_id=voice_id,
        )
