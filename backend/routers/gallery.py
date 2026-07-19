import os
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from db.database import db_dependency
from db.db_models import GalleryImage, UserRole
from db.base_models import GalleryImageOut
from utils.logger_utils import Logger
from utils.path_utils import PathUtils
from utils.generic_utils import get_current_datetime, log_activity
from routers.auth import admin_dependency, optional_user_dependency

UPLOAD_DIR = os.path.join(str(PathUtils().get_base_path()), "uploads", "gallery")
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


class GalleryRouter:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.router = APIRouter(
            prefix="/api/gallery",
            tags=["gallery"],
            responses={404: {"description": "Not found"}},
        )
        self.setup_routes()

    def setup_routes(self):
        @self.router.get("", response_model=list[GalleryImageOut])
        async def list_images(
            db: db_dependency,
            user: optional_user_dependency,
            include_inactive: bool = False,
        ):
            """Public: active gallery photos. Admins can pass include_inactive=true."""
            self.logger.info(
                f"inside list_images method..........include_inactive: {include_inactive}"
            )
            q = db.query(GalleryImage)
            if include_inactive:
                if not user or user.get("user_role") != UserRole.ADMIN.value:
                    raise HTTPException(status_code=403, detail="Admin access required")
            else:
                q = q.filter(GalleryImage.is_active.isnot(False))  # NULL counts as active
            return q.order_by(GalleryImage.created_at.desc()).all()

        @self.router.post("", response_model=GalleryImageOut, status_code=201)
        async def add_image(
            db: db_dependency,
            admin: admin_dependency,
            file: UploadFile = File(...),
            title: str = Form(""),
        ):
            """Admin: upload a new gallery photo."""
            self.logger.info(
                f"inside add_image method..........filename: {file.filename}, "
                f"requested by admin: {admin['username']}"
            )
            ext = os.path.splitext(file.filename or "")[1].lower()
            if ext not in ALLOWED_IMAGE_EXTS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTS))}",
                )
            if len(title) > 200:
                raise HTTPException(
                    status_code=400, detail="Title is too long (max 200 characters)"
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

            image = GalleryImage(
                title=title.strip(),
                image_url=f"/uploads/gallery/{filename}",
                is_active=True,
                created_at=get_current_datetime(),
            )
            db.add(image)
            db.commit()
            db.refresh(image)
            log_activity(
                db,
                "gallery_image_added",
                admin["id"],
                f"Added gallery photo #{image.id} '{image.title or file.filename}'",
            )
            return image

        @self.router.put("/{image_id}", response_model=GalleryImageOut)
        async def restore_image(image_id: int, db: db_dependency, admin: admin_dependency):
            """Admin: bring a soft-deleted photo back."""
            self.logger.info(
                f"inside restore_image method..........image_id: {image_id}, "
                f"requested by admin: {admin['username']}"
            )
            image = db.query(GalleryImage).filter(GalleryImage.id == image_id).first()
            if not image:
                raise HTTPException(status_code=404, detail="Image not found")
            image.is_active = True
            image.modified_at = get_current_datetime()
            db.commit()
            db.refresh(image)
            log_activity(
                db, "gallery_image_restored", admin["id"], f"Restored gallery photo #{image.id}"
            )
            return image

        @self.router.delete("/{image_id}", status_code=204)
        async def remove_image(image_id: int, db: db_dependency, admin: admin_dependency):
            """Admin: soft delete — the photo is hidden, the row and file are kept."""
            self.logger.info(
                f"inside remove_image method..........image_id: {image_id}, "
                f"requested by admin: {admin['username']}"
            )
            image = db.query(GalleryImage).filter(GalleryImage.id == image_id).first()
            if not image:
                raise HTTPException(status_code=404, detail="Image not found")
            image.is_active = False
            image.modified_at = get_current_datetime()
            db.commit()
            log_activity(
                db, "gallery_image_removed", admin["id"], f"Deactivated gallery photo #{image.id}"
            )


gallery_router = GalleryRouter()
