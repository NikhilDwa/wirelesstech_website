from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from db.database import db_dependency
from utils.logger_utils import Logger
from utils.email_utils import EmailUtils
from utils.path_utils import PathUtils
from utils.generic_utils import log_activity, SimpleRateLimiter


class EstimateRequest(BaseModel):
    brand: str = Field(..., max_length=100)
    model: str = Field(..., max_length=100)
    problems: List[str] = Field(default_factory=list, max_length=20)
    name: str = Field(..., max_length=120)
    phone: Optional[str] = Field("", max_length=30)
    email: EmailStr


class ContactRequest(BaseModel):
    name: str = Field(..., max_length=120)
    email: EmailStr
    phone: Optional[str] = Field("", max_length=30)
    message: str = Field(..., max_length=3000)


# Blunt automated spam on the public contact/estimate forms: 8 per IP per hour
service_form_rate_limiter = SimpleRateLimiter(max_requests=8, window_seconds=3600)


class ServiceRouter:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.router = APIRouter(
            prefix="/api/services",
            tags=["services"],
            responses={404: {"description": "Not found"}},
        )
        config = PathUtils().get_configuration()
        self.shop_email = config["CRON_EMAIL"]["report_to"]
        self.setup_routes()

    def notify_shop(self, subject: str, message: str) -> None:
        """Email the shop inbox; failures are logged but never break the request."""
        try:
            EmailUtils().send_transactional_email(
                to=self.shop_email, subject_request=subject, message_request=message
            )
        except Exception:
            self.logger.exception("Failed to send service email.")

    def setup_routes(self):
        @self.router.post("/estimate", status_code=201)
        async def request_estimate(
            body: EstimateRequest,
            db: db_dependency,
            request: Request,
            background_tasks: BackgroundTasks,
        ):
            """Public: customer asks for a free repair estimate."""
            self.logger.info(
                f"inside request_estimate method..........brand: {body.brand}, model: {body.model}"
            )
            service_form_rate_limiter.check(request.client.host if request.client else "unknown")
            if not body.name.strip():
                raise HTTPException(status_code=400, detail="Name is required")
            problems = ", ".join(body.problems) or "not specified"
            background_tasks.add_task(
                self.notify_shop,
                f"Repair estimate request: {body.brand} {body.model}",
                (
                    f"New repair estimate request\n\n"
                    f"Device: {body.brand} {body.model}\n"
                    f"Problems: {problems}\n\n"
                    f"Customer: {body.name}\n"
                    f"Phone: {body.phone or '-'}\n"
                    f"Email: {body.email}"
                ),
            )
            log_activity(
                db,
                "estimate_requested",
                None,
                f"{body.name} ({body.email}) asked about {body.brand} {body.model}: {problems}",
            )
            return {"detail": "Estimate request received. We'll get back to you shortly."}

        @self.router.post("/contact", status_code=201)
        async def contact(
            body: ContactRequest,
            db: db_dependency,
            request: Request,
            background_tasks: BackgroundTasks,
        ):
            """Public: contact form message."""
            self.logger.info(f"inside contact method..........from: {body.email}")
            service_form_rate_limiter.check(request.client.host if request.client else "unknown")
            if not body.name.strip() or not body.message.strip():
                raise HTTPException(status_code=400, detail="Name and message are required")
            background_tasks.add_task(
                self.notify_shop,
                f"Contact form message from {body.name}",
                (
                    f"New contact form message\n\n"
                    f"From: {body.name}\n"
                    f"Phone: {body.phone or '-'}\n"
                    f"Email: {body.email}\n\n"
                    f"{body.message}"
                ),
            )
            log_activity(db, "contact_message", None, f"{body.name} ({body.email}) sent a message")
            return {"detail": "Message received. We'll get back to you shortly."}


service_router = ServiceRouter()
