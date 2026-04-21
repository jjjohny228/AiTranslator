from sqlalchemy import inspect, text

from app import models  # noqa: F401
from app.db import Base, engine


def _ensure_user_ui_language_column() -> None:
    inspector = inspect(engine)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "ui_language" in user_columns:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN ui_language VARCHAR(64)"))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_user_ui_language_column()
