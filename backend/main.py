import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from db import db_models
from db.database import engine
from utils.path_utils import PathUtils

from routers.auth import auth_router
from routers.account import account_router
from routers.categories import category_router
from routers.products import product_router
from routers.orders import order_router
from routers.activities import activity_router
from routers.services import service_router
from routers.gallery import gallery_router

app = FastAPI()

db_models.Base.metadata.create_all(bind=engine)


def run_light_migrations():
    """create_all only adds brand-new tables; existing tables need manual
    ALTER TABLE for new columns. Each step is idempotent (checks first)."""
    inspector = inspect(engine)
    if "order_items" in inspector.get_table_names():
        cols = [c["name"] for c in inspector.get_columns("order_items")]
        if "image_url" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE order_items ADD COLUMN image_url VARCHAR(500) DEFAULT ''")
                )


run_light_migrations()


config = PathUtils().get_configuration()
origins = config["CORS"]["allowed_origins"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    """Baseline hardening headers on every response, including static /uploads files."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.include_router(auth_router.router)
app.include_router(account_router.router)
app.include_router(category_router.router)
app.include_router(product_router.router)
app.include_router(order_router.router)
app.include_router(activity_router.router)
app.include_router(service_router.router)
app.include_router(gallery_router.router)

# Serve uploaded product images at /uploads/...
uploads_dir = os.path.join(str(PathUtils().get_base_path()), "uploads")
os.makedirs(os.path.join(uploads_dir, "products"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=config["APPS"]["host"],
        port=config["APPS"]["port"],
        log_level="info",
    )
