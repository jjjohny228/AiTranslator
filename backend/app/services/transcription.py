from io import BytesIO

from app.core.config import get_settings
from app.services.openai_client import get_openai_client


class TranscriptionService:
    def __init__(self) -> None:
        settings = get_settings()
        self.model = settings.whisper_model
        self.client = get_openai_client()

    async def transcribe(self, *, content: bytes, filename: str, language: str | None = None) -> str:
        file_obj = BytesIO(content)
        file_obj.name = filename
        response = await self.client.audio.transcriptions.create(
            model=self.model,
            file=file_obj,
            language=None if not language or language == "auto" else language,
        )
        return response.text.strip()

