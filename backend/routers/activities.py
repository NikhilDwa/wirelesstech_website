from typing import Optional

from fastapi import APIRouter, Query

from db.database import db_dependency
from db.db_models import Activity, User
from db.base_models import ActivityOut
from utils.logger_utils import Logger
from routers.auth import admin_dependency


class ActivityRouter:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.router = APIRouter(
            prefix="/api/activities",
            tags=["activities (admin)"],
            responses={404: {"description": "Not found"}},
        )
        self.setup_routes()

    def setup_routes(self):
        @self.router.get("", response_model=list[ActivityOut])
        async def list_activities(
            db: db_dependency,
            admin: admin_dependency,
            user_id: Optional[int] = None,
            username: Optional[str] = None,
            action: Optional[str] = None,
            skip: int = Query(0, ge=0),
            limit: int = Query(100, ge=1, le=500),
        ):
            """Admin: browse the activity log, optionally filtered by user (id or a
            partial username match) or action type."""
            self.logger.info(
                f"inside list_activities method..........user_id: {user_id}, username: {username}, "
                f"action: {action}, requested by admin: {admin['username']}"
            )
            q = db.query(Activity)
            if user_id is not None:
                q = q.filter(Activity.user_id == user_id)
            if username:
                q = q.join(User, Activity.user_id == User.id).filter(
                    User.username.ilike(f"%{username.strip()}%")
                )
            if action:
                q = q.filter(Activity.action == action)
            rows = q.order_by(Activity.created_at.desc()).offset(skip).limit(limit).all()
            return [
                ActivityOut(
                    id=a.id,
                    user_id=a.user_id,
                    user_name=(a.user.username or a.user.user_email) if a.user else "guest",
                    action=a.action,
                    detail=a.detail,
                    created_at=a.created_at,
                )
                for a in rows
            ]

        @self.router.get("/actions", response_model=list[str])
        async def list_action_types(db: db_dependency, admin: admin_dependency):
            """Distinct action types present in the log (useful for filter dropdowns)."""
            self.logger.info(
                f"inside list_action_types method..........requested by admin: {admin['username']}"
            )
            rows = db.query(Activity.action).distinct().order_by(Activity.action).all()
            return [r[0] for r in rows]


activity_router = ActivityRouter()
