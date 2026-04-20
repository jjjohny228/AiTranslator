# Lingua Voice

`Lingua Voice` is a full-stack translator for text messages and voice notes.
It combines:

- `FastAPI` for the backend API
- `React + Vite` for the client UI
- `LangChain + OpenAI` for translation orchestration
- `Whisper` for speech-to-text transcription
- `ElevenLabs` for spoken translations

## What is better than a plain Google Translate clone

- text and audio translation in one workspace
- `balanced`, `literal`, and `natural` translation modes
- automatic source-language detection
- optional voice playback in the target language
- browser-side microphone recording for quick voice-note translation

## Project structure

```text
backend/
  app/
    api/
    core/
    schemas/
    services/
frontend/
  src/
```

## Backend setup

```bash
cp .env.example .env
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn app.main:app --app-dir backend --reload
```

Backend runs on [http://127.0.0.1:8000](http://127.0.0.1:8000)

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on [http://127.0.0.1:5173](http://127.0.0.1:5173)

If you want a custom backend URL:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

If you run the frontend through the Vite dev server and want `/api` proxying:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

## Environment variables

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
WHISPER_MODEL=whisper-1
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
REQUEST_TIMEOUT_SECONDS=60
DATABASE_URL=postgresql+psycopg://translator:translator@localhost:5432/translator
```

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Services:

- frontend: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- backend: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- postgres: `localhost:5432`

The backend container waits for PostgreSQL and creates the required tables automatically on startup.
The frontend container uses `VITE_API_BASE_URL=/api` and proxies API requests to `http://backend:8000`.

## API endpoints

- `GET /api/health`
- `POST /api/translate/text`
- `POST /api/translate/audio`

## Notes

- The backend keeps the OpenAI model configurable via `OPENAI_MODEL`.
- I did not hardcode a single `gpt-5.4` identifier because model availability can differ by account and snapshot.
- Audio output is returned as base64 and played directly in the browser.

## Next improvements

- streaming translation for live calls
- recent translation history
- user glossaries and domain-specific terminology
- speaker diarization for multi-speaker audio
