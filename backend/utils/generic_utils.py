import time
from datetime import datetime, timezone

import pytz
from fastapi import HTTPException

from utils.path_utils import PathUtils


class SimpleRateLimiter:
    """In-memory limiter: blocks a key (e.g. client IP) after too many requests
    within a time window. Use for public, unauthenticated endpoints (signup,
    password reset requests, contact forms) to blunt spam/abuse.

    Note: state is per-process, so behind multiple uvicorn/gunicorn workers or
    app instances each one enforces its own limit independently. Fine for a
    single-instance deployment; move to a shared store (e.g. Redis) if the
    app is ever scaled horizontally.
    """

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.hits: dict = {}

    def check(self, key: str) -> None:
        now = time.time()
        recent = [t for t in self.hits.get(key, []) if now - t < self.window_seconds]
        recent.append(now)
        self.hits[key] = recent
        if len(recent) > self.max_requests:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again later.",
            )


def create_database_url() -> str:
    """
    Generates a PostgreSQL database URL using configuration settings.

    Return:
        str: URL string that is constructed using the configuration values for PostgreSQL database.
    """
    config: dict = PathUtils().get_configuration()
    postgresql_config: dict = config["POSTGRESQL_DATABASE"]

    database_url: str = (
        f"postgresql://{postgresql_config['postgresql_user']}:"
        f"{postgresql_config['password']}@{postgresql_config['hostname']}/"
        f"{postgresql_config['database']}"
    )
    return database_url


def get_current_datetime(tz_str: str = "America/New_York") -> datetime:
    """
    Function that returns the current date and time in the specified timezone.

    Args:
        tz_str (str): Timezone string (e.g., 'America/New_York'). Defaults to 'America/New_York'.

    Returns:
        datetime: Timezone-aware current date and time, safe to store in TIMESTAMP columns.
    """
    tz = pytz.timezone(tz_str)
    return datetime.now(timezone.utc).astimezone(tz)


def log_activity(db, action: str, user_id: int = None, detail: str = "") -> None:
    """
    Record a user/admin action in the activities table.

    Args:
        db: Active SQLAlchemy session.
        action (str): Short action name, e.g. "login", "signup", "account_updated".
        user_id (int): ID of the user who performed the action (None for anonymous).
        detail (str): Human-readable description of the action.
    """
    from db.db_models import Activity  # local import to avoid a circular import

    activity = Activity(
        user_id=user_id,
        action=action,
        detail=detail,
        created_at=get_current_datetime(),
    )
    db.add(activity)
    db.commit()


def check_user_is_admin(user: dict) -> bool:
    """
    This function validates that the user dictionary contains the key `user_role` with the value "admin".
    If the user does not have the "admin" role, an HTTPException with a status code of 401 is raised.

    Args:
        user (dict): A dictionary representing the user.

    Returns:
        bool: Returns `True` if the user is an admin, otherwise raises an HTTPException.
    """
    if user is None or user.get("user_role") != "admin":
        raise HTTPException(status_code=401, detail="Authentication Failed.")
    return True


def check_user(user: dict) -> bool:
    """
    This function validates the user. If the user is None, an HTTPException with a status code of 401 is raised.

    Args:
        user (dict): A dictionary representing the user.

    Returns:
        bool: Returns `True` if the user is not None, otherwise raises an HTTPException.
    """
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication Failed.")
    return True
