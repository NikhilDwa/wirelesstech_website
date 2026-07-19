from fastapi import APIRouter, HTTPException, Query

from db.database import db_dependency
from db.db_models import User, UserRole
from db.base_models import UserAdminUpdate, UserOut
from utils.logger_utils import Logger
from utils.generic_utils import get_current_datetime, log_activity
from routers.auth import admin_dependency


class AccountRouter:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.router = APIRouter(
            prefix="/api/account",
            tags=["account"],
            responses={404: {"description": "Not found"}},
        )
        self.setup_routes()

    def setup_routes(self):
        @self.router.get("", response_model=list[UserOut])
        async def list_users(
            db: db_dependency,
            admin: admin_dependency,
            skip: int = Query(0, ge=0),
            limit: int = Query(200, ge=1, le=500),
        ):
            self.logger.info(
                f"inside list_users method..........requested by admin: {admin['username']}"
            )
            return db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()

        @self.router.put("/{user_id}", response_model=UserOut)
        async def update_user(
            user_id: int,
            body: UserAdminUpdate,
            db: db_dependency,
            admin: admin_dependency,
        ):
            self.logger.info(
                f"inside update_user method..........user_id: {user_id}, requested by admin: {admin['username']}"
            )
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            if user.id == admin["id"] and body.is_active is False:
                raise HTTPException(
                    status_code=400, detail="You cannot deactivate your own account"
                )

            changes = body.model_dump(exclude_unset=True)
            if "role" in changes:
                try:
                    changes["role"] = UserRole(changes["role"])
                except ValueError:
                    raise HTTPException(
                        status_code=400, detail="Role must be 'customer' or 'admin'"
                    )

            for key, value in changes.items():
                setattr(user, key, value)
            user.modified_at = get_current_datetime()
            db.commit()
            db.refresh(user)
            log_activity(
                db,
                "account_updated",
                admin["id"],
                f"Admin changed {user.user_email}: {', '.join(changes.keys())}",
            )
            return user

        @self.router.delete("/{user_id}", status_code=204)
        async def delete_user(
            user_id: int,
            db: db_dependency,
            admin: admin_dependency,
        ):
            """Soft delete: the account is deactivated (is_active=False), never removed.
            Reactivate it with PUT /{user_id} and body {"is_active": true}."""
            self.logger.info(
                f"inside delete_user method..........user_id: {user_id}, requested by admin: {admin['username']}"
            )
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            if user.id == admin["id"]:
                raise HTTPException(status_code=400, detail="You cannot delete your own account")
            user.is_active = False
            user.modified_at = get_current_datetime()
            db.commit()
            log_activity(
                db,
                "account_deactivated",
                admin["id"],
                f"Admin deactivated account {user.user_email}",
            )


account_router = AccountRouter()
