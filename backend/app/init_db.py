from app import models  # noqa: F401
from app.db import Base, engine


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
