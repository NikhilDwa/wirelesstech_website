from fastapi import APIRouter, HTTPException
from sqlalchemy import func

from db.database import db_dependency
from db.db_models import Category, UserRole
from db.base_models import CategoryCreate, CategoryOut, CategoryUpdate
from utils.logger_utils import Logger
from utils.generic_utils import get_current_datetime, log_activity
from routers.auth import admin_dependency, optional_user_dependency


class CategoryRouter:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.router = APIRouter(
            prefix="/api/categories",
            tags=["categories"],
            responses={404: {"description": "Not found"}},
        )
        self.setup_routes()

    def setup_routes(self):
        @self.router.get("", response_model=list[CategoryOut])
        async def list_categories(
            db: db_dependency,
            user: optional_user_dependency,
            include_inactive: bool = False,
        ):
            """Public: active categories. Admins can pass include_inactive=true to see all."""
            self.logger.info(
                f"inside list_categories method..........include_inactive: {include_inactive}"
            )
            if include_inactive:
                if not user or user.get("user_role") != UserRole.ADMIN.value:
                    raise HTTPException(status_code=403, detail="Admin access required")
                return db.query(Category).order_by(Category.name).all()
            return (
                db.query(Category)
                .filter(Category.is_active.isnot(False))  # NULL counts as active
                .order_by(Category.name)
                .all()
            )

        @self.router.post("", response_model=CategoryOut, status_code=201)
        async def create_category(
            body: CategoryCreate, db: db_dependency, admin: admin_dependency
        ):
            self.logger.info(
                f"inside create_category method..........name: {body.name}, requested by admin: {admin['username']}"
            )
            name = body.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Category name cannot be empty")
            exists = db.query(Category).filter(func.lower(Category.name) == name.lower()).first()
            if exists and exists.is_active:
                raise HTTPException(status_code=400, detail=f"Category '{name}' already exists")
            if exists:
                # Was soft-deleted earlier: restore it instead of creating a duplicate
                exists.is_active = True
                exists.modified_at = get_current_datetime()
                db.commit()
                db.refresh(exists)
                log_activity(
                    db, "category_restored", admin["id"], f"Restored category '{exists.name}'"
                )
                return exists
            category = Category(name=name, is_active=True, created_at=get_current_datetime())
            db.add(category)
            db.commit()
            db.refresh(category)
            log_activity(db, "category_created", admin["id"], f"Added category '{name}'")
            return category

        @self.router.put("/{category_id}", response_model=CategoryOut)
        async def update_category(
            category_id: int, body: CategoryUpdate, db: db_dependency, admin: admin_dependency
        ):
            self.logger.info(
                f"inside update_category method..........category_id: {category_id}, "
                f"requested by admin: {admin['username']}"
            )
            category = db.query(Category).filter(Category.id == category_id).first()
            if not category:
                raise HTTPException(status_code=404, detail="Category not found")
            if body.name is not None:
                name = body.name.strip()
                if not name:
                    raise HTTPException(status_code=400, detail="Category name cannot be empty")
                dup = (
                    db.query(Category)
                    .filter(func.lower(Category.name) == name.lower())
                    .filter(Category.id != category_id)
                    .first()
                )
                if dup and dup.is_active is not False:
                    raise HTTPException(
                        status_code=400, detail=f"Category '{name}' already exists"
                    )
                category.name = name
            category.modified_at = get_current_datetime()
            db.commit()
            db.refresh(category)
            log_activity(
                db,
                "category_updated",
                admin["id"],
                f"Renamed category #{category_id} to '{category.name}'",
            )
            return category

        @self.router.delete("/{category_id}", status_code=204)
        async def delete_category(category_id: int, db: db_dependency, admin: admin_dependency):
            self.logger.info(
                f"inside delete_category method..........category_id: {category_id}, "
                f"requested by admin: {admin['username']}"
            )
            category = db.query(Category).filter(Category.id == category_id).first()
            if not category:
                raise HTTPException(status_code=404, detail="Category not found")
            # Soft delete: keep the row (and any products already using it — they stay
            # visible in the shop) — just hide it from being assigned to new/edited products.
            category.is_active = False
            category.modified_at = get_current_datetime()
            db.commit()
            log_activity(
                db, "category_deactivated", admin["id"], f"Deactivated category '{category.name}'"
            )


category_router = CategoryRouter()
