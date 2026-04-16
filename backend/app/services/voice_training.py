from __future__ import annotations

from io import BytesIO

import httpx
from fastapi import HTTPException

from app.schemas.profile import VoiceScriptResponse


VOICE_SCRIPTS = {
    "English": [
        "Hello, I am recording my custom voice for Lingua Voice. I speak clearly and at a natural pace so the model can learn my pronunciation and tone.",
        "This sample should sound relaxed, confident, and consistent. I will keep my microphone steady and avoid background noise while reading each sentence.",
        "Today I am talking about ordinary daily situations: meeting a friend after work, planning a trip, buying groceries, and sending short voice messages.",
        "When I speak, I try to vary my rhythm slightly, but I keep my voice natural. That helps the system understand how I sound in real conversation.",
        "If someone opens my room through an invite link, I want my translated speech to sound like me, not like a generic synthetic voice.",
    ],
    "Ukrainian": [
        "Привіт, я записую свій кастомний голос для Lingua Voice. Я говорю чітко, спокійно та в природному темпі, щоб модель краще вивчила мою вимову.",
        "Під час запису я намагаюся уникати шуму, не поспішати та вимовляти слова зрозуміло. Це допомагає створити якісніший голосовий профіль.",
        "Я можу говорити про звичайні речі: зустрічі після роботи, поїздки, покупки, голосові повідомлення та короткі побутові ситуації.",
        "Мені важливо, щоб переклад у кімнаті звучав моїм голосом і передавав мою манеру мовлення, а не просто стандартний синтезований тембр.",
        "Я продовжую читати рівно та стабільно, додаючи трохи живої інтонації, щоб майбутній синтез звучав природно та переконливо.",
    ],
    "Russian": [
        "Привет, я записываю свой кастомный голос для Lingua Voice. Я говорю ясно, спокойно и без лишнего шума, чтобы модель лучше запомнила мой тембр.",
        "Во время записи я стараюсь сохранять одинаковую громкость и говорить естественно, как в обычной переписке или в голосовом сообщении другу.",
        "Я могу рассказывать про повседневные вещи: работу, встречи, поездки, покупки, планы на вечер и короткие разговоры в чате.",
        "Мне хочется, чтобы после создания голоса переведённые сообщения в комнате звучали именно моим голосом, даже если собеседник зашёл по ссылке.",
        "Я продолжаю читать текст уверенно и ровно, чтобы система уловила мои интонации, ритм речи и особенности произношения слов.",
    ],
}


def get_voice_script(language: str) -> VoiceScriptResponse:
    passages = VOICE_SCRIPTS.get(language, VOICE_SCRIPTS["English"])
    return VoiceScriptResponse(
        language=language,
        recommended_seconds=120,
        instructions="Read these passages in a quiet room. Record around two minutes in total, speaking naturally and clearly.",
        passages=passages,
    )


class VoiceTrainingService:
    async def create_instant_voice_clone(
        self,
        *,
        api_key: str,
        voice_name: str,
        language: str,
        gender: str,
        files: list[tuple[str, bytes, str]],
    ) -> str:
        multipart_files = [
            ("files", (filename, BytesIO(content), mime_type))
            for filename, content, mime_type in files
        ]
        data = {
            "name": voice_name,
            "description": "Custom Lingua Voice profile",
            "labels": f'{{"language":"{language}","gender":"{gender}"}}',
            "remove_background_noise": "false",
        }
        headers = {"xi-api-key": api_key}
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "https://api.elevenlabs.io/v1/voices/add",
                headers=headers,
                data=data,
                files=multipart_files,
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=f"Voice cloning failed: {response.text}")
        payload = response.json()
        voice_id = payload.get("voice_id")
        if not voice_id:
            raise HTTPException(status_code=500, detail="Voice cloning failed: missing voice_id.")
        return voice_id


voice_training_service = VoiceTrainingService()
