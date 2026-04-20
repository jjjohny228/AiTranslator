#!/bin/sh
set -e

python - <<'PY'
import time

from sqlalchemy import create_engine, text

from app.core.config import get_settings
from app.init_db import init_db

settings = get_settings()
engine = create_engine(settings.database_url, future=True, pool_pre_ping=True)

last_error = None
for attempt in range(30):
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        init_db()
        print("Database is ready and schema is initialized.")
        break
    except Exception as exc:
        last_error = exc
        print(f"Waiting for database... ({attempt + 1}/30)")
        time.sleep(2)
else:
    raise SystemExit(f"Database did not become ready: {last_error}")
PY

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
