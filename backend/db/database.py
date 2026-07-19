from fastapi import Depends
from typing import Annotated
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.ext.declarative import declarative_base

from utils.generic_utils import create_database_url

SQLALCHEMY_DATABASE_URL = create_database_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,  # check a connection is alive before using it (avoids stale
    # "server closed the connection unexpectedly" errors after idle periods)
    pool_recycle=1800,  # recycle connections every 30 min, ahead of most DB-side idle timeouts
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


db_dependency = Annotated[Session, Depends(get_db)]
