import base64

import httpx

from app.core.config import get_settings


class SpeechService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def synthesize(self, *, text: str, voice_id: str | None = None) -> tuple[str, str]:
        selected_voice_id = voice_id or self.settings.elevenlabs_voice_id
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{selected_voice_id}"
        headers = {
            "xi-api-key": self.settings.elevenlabs_api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }
        payload = {
            "text": text,
            "model_id": self.settings.elevenlabs_model_id,
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.8,
            },
        }
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        return base64.b64encode(response.content).decode("utf-8"), "audio/mpeg"
