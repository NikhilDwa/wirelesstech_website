import os
import uuid
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from db.database import db_dependency
from db.db_models import Category, Product, UserRole
from db.base_models import ProductCreate, ProductListOut, ProductOut, ProductUpdate
from utils.logger_utils import Logger
from utils.path_utils import PathUtils
from utils.generic_utils import get_current_datetime, log_activity
from routers.auth import admin_dependency, optional_user_dependency

# Where uploaded product images are stored on disk: <project root>/uploads/products/
UPLOAD_DIR = os.path.join(str(PathUtils().get_base_path()), "uploads", "products")
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


class ProductRouter:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.router = APIRouter(
            prefix="/api/products",
            tags=["products"],
            responses={404: {"description": "Not found"}},
        )
        self.setup_routes()

    def ensure_category(
        self, db, category_id: int, keep_existing_id: Optional[int] = None
    ) -> Category:
        """Validate a category_id for a product. Deactivated categories can't be newly
        assigned, but keep_existing_id lets a product keep the category it already has
        (so editing other fields on an old product doesn't break)."""
        category = db.query(Category).filter(Category.id == category_id).first()
        if not category:
            raise HTTPException(status_code=400, detail="Selected category does not exist")
        if category.is_active is False and category_id != keep_existing_id:
            raise HTTPException(
                status_code=400,
                detail=f"Category '{category.name}' is deactivated and can't be assigned to products",
            )
        return category

    def setup_routes(self):
        @self.router.get("", response_model=ProductListOut)
        async def list_products(
            db: db_dependency,
            user: optional_user_dependency,
            category_id: Optional[int] = None,
            min_price: Optional[float] = None,
            max_price: Optional[float] = None,
            search: Optional[str] = None,
            sort: str = Query("recent", pattern="^(recent|price_asc|price_desc)$"),
            skip: int = Query(0, ge=0),
            limit: int = Query(24, ge=1, le=100),
            include_inactive: bool = False,
        ):
            """Public: active products with category/price filters and sorting.
            Admins can pass include_inactive=true to also see soft-deleted products."""
            self.logger.info(
                f"inside list_products method..........category_id: {category_id}, search: {search}, sort: {sort}"
            )
            q = db.query(Product)
            if include_inactive:
                if not user or user.get("user_role") != UserRole.ADMIN.value:
                    raise HTTPException(status_code=403, detail="Admin access required")
            else:
                q = q.filter(Product.is_active.isnot(False))  # NULL counts as active
            if category_id is not None:
                q = q.filter(Product.category_id == category_id)
            if min_price is not None:
                q = q.filter(Product.price >= min_price)
            if max_price is not None:
                q = q.filter(Product.price <= max_price)
            if search:
                q = q.filter(Product.name.ilike(f"%{search}%"))

            total = q.count()

            if sort == "price_asc":
                q = q.order_by(Product.price.asc())
            elif sort == "price_desc":
                q = q.order_by(Product.price.desc())
            else:
                q = q.order_by(Product.created_at.desc())

            items = q.offset(skip).limit(limit).all()
            return ProductListOut(items=[ProductOut.model_validate(i) for i in items], total=total)

        @self.router.post("/upload-image")
        async def upload_image(admin: admin_dependency, file: UploadFile = File(...)):
            """Admin: upload a product image file. Saves it under <project root>/uploads/products/
            and returns the URL path to store on the product."""
            self.logger.info(
                f"inside upload_image method..........filename: {file.filename}, "
                f"requested by admin: {admin['username']}"
            )
            ext = os.path.splitext(file.filename or "")[1].lower()
            if ext not in ALLOWED_IMAGE_EXTS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTS))}",
                )
            os.makedirs(UPLOAD_DIR, exist_ok=True)
            filename = f"{uuid.uuid4().hex}{ext}"
            dest = os.path.join(UPLOAD_DIR, filename)

            size = 0
            with open(dest, "wb") as out:
                while chunk := file.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_IMAGE_BYTES:
                        out.close()
                        os.remove(dest)
                        raise HTTPException(
                            status_code=400, detail="Image is too large (max 5 MB)"
                        )
                    out.write(chunk)

            return {"image_url": f"/uploads/products/{filename}"}

        @self.router.get("/{product_id}", response_model=ProductOut)
        async def get_product(product_id: int, db: db_dependency, user: optional_user_dependency):
            self.logger.info(f"inside get_product method..........product_id: {product_id}")
            product = db.query(Product).filter(Product.id == product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")
            if product.is_active is False and (
                not user or user.get("user_role") != UserRole.ADMIN.value
            ):
                # Soft-deleted products stay hidden from customers, visible to admins
                raise HTTPException(status_code=404, detail="Product not found")
            if user:
                log_activity(
                    db, "product_viewed", user["id"], f"Viewed '{product.name}' (#{product.id})"
                )
            return product

        # ---------- Admin only ----------

        @self.router.post("", response_model=ProductOut, status_code=201)
        async def create_product(body: ProductCreate, db: db_dependency, admin: admin_dependency):
            self.logger.info(
                f"inside create_product method..........name: {body.name}, "
                f"requested by admin: {admin['username']}"
            )
            self.ensure_category(db, body.category_id)
            product = Product(
                **body.model_dump(), is_active=True, created_at=get_current_datetime()
            )
            db.add(product)
            db.commit()
            db.refresh(product)
            log_activity(
                db, "product_created", admin["id"], f"Added '{product.name}' (#{product.id})"
            )
            return product

        @self.router.put("/{product_id}", response_model=ProductOut)
        async def update_product(
            product_id: int, body: ProductUpdate, db: db_dependency, admin: admin_dependency
        ):
            self.logger.info(
                f"inside update_product method..........product_id: {product_id}, "
                f"requested by admin: {admin['username']}"
            )
            product = db.query(Product).filter(Product.id == product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")
            changes = body.model_dump(exclude_unset=True)
            if changes.get("category_id") is not None:
                self.ensure_category(
                    db, changes["category_id"], keep_existing_id=product.category_id
                )
            for key, value in changes.items():
                setattr(product, key, value)
            product.modified_at = get_current_datetime()
            db.commit()
            db.refresh(product)
            log_activity(
                db, "product_updated", admin["id"], f"Edited '{product.name}' (#{product.id})"
            )
            return product

        @self.router.delete("/{product_id}", status_code=204)
        async def delete_product(product_id: int, db: db_dependency, admin: admin_dependency):
            self.logger.info(
                f"inside delete_product method..........product_id: {product_id}, "
                f"requested by admin: {admin['username']}"
            )
            product = db.query(Product).filter(Product.id == product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")
            # Soft delete: keep the row (and its order history), just deactivate it.
            # Restore with PUT /{product_id} and body {"is_active": true}.
            product.is_active = False
            product.modified_at = get_current_datetime()
            db.commit()
            log_activity(
                db,
                "product_deactivated",
                admin["id"],
                f"Deactivated '{product.name}' (#{product_id})",
            )


product_router = ProductRouter()
