import re
import time
import string
from datetime import timedelta, datetime, timezone

from sqlalchemy import func
from starlette import status
from typing import Annotated, Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from db.db_models import User, UserRole
from utils.logger_utils import Logger
from db.database import db_dependency
from utils.path_utils import PathUtils
from utils.email_utils import EmailUtils
from db.base_models import (
    GoogleLoginRequest,
    UserBase,
    Token,
    TokenResponse,
    UserOut,
    RefreshRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UserChangePassword,
)
from utils.generic_utils import get_current_datetime, log_activity, SimpleRateLimiter

bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_bearer = OAuth2PasswordBearer(tokenUrl="api/auth/token")
oauth2_bearer_optional = OAuth2PasswordBearer(tokenUrl="api/auth/token", auto_error=False)

ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_MINUTES = 7 * 24 * 60  # 7 days
RESET_TOKEN_EXPIRE_MINUTES = 30
RATE_LIMIT_MAX_ATTEMPTS = 5
RATE_LIMIT_WINDOW_SECONDS = 900  # 15 minutes


class LoginRateLimiter:
    """In-memory limiter: blocks a username/IP pair after too many failed logins."""

    def __init__(
        self,
        max_attempts: int = RATE_LIMIT_MAX_ATTEMPTS,
        window_seconds: int = RATE_LIMIT_WINDOW_SECONDS,
    ):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.failures: dict = {}

    def check(self, key: str) -> None:
        now = time.time()
        recent = [t for t in self.failures.get(key, []) if now - t < self.window_seconds]
        self.failures[key] = recent
        if len(recent) >= self.max_attempts:
            raise HTTPException(
                status_code=429,
                detail="Too many failed login attempts. Please try again in a few minutes.",
            )

    def record_failure(self, key: str) -> None:
        self.failures.setdefault(key, []).append(time.time())

    def reset(self, key: str) -> None:
        self.failures.pop(key, None)


login_rate_limiter = LoginRateLimiter()
# Blunt automated signup/reset spam: 8 attempts per IP per hour on each endpoint
signup_rate_limiter = SimpleRateLimiter(max_requests=8, window_seconds=3600)
forgot_password_rate_limiter = SimpleRateLimiter(max_requests=8, window_seconds=3600)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


class UserRouter:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.router = APIRouter(
            prefix="/api/auth",
            tags=["auth"],
            responses={404: {"description": "Not found"}},
        )
        config = PathUtils().get_configuration()
        self.jwt_secret_key = config["JWT"]["SECRET_KEY"]
        self.jwt_algorithm = config["JWT"]["ALGORITHM"]
        self.google_client_id = (config.get("GOOGLE") or {}).get("CLIENT_ID")
        self.frontend_url = (config["APPS"].get("frontend_url") or "http://localhost:3000").rstrip(
            "/"
        )
        self.setup_routes()

    def authenticate_user(self, username: str, password: str, db):
        # NOTE: never log passwords
        self.logger.info(f"inside authenticate_user method..........username: {username}")
        user = (
            db.query(User)
            .filter(User.username == username)
            .filter(User.is_active.isnot(False))  # NULL counts as active
            .first()
        )
        if not user:
            return False
        if not user.hashed_password:
            # Google-only account: no password login
            return False
        if not bcrypt_context.verify(password, user.hashed_password):
            return False
        return user

    def create_access_token(
        self,
        username: str,
        user_id: int,
        role: UserRole,
        expires_delta: timedelta,
        token_type: str = "access",
    ):
        self.logger.info(
            f"inside create_access_token method..........username: {username}, user_id: {user_id}, "
            f"role: {role}, token_type: {token_type}"
        )
        encode = {"sub": username, "id": user_id, "role": role.value, "type": token_type}
        expires = datetime.now(timezone.utc) + expires_delta
        encode.update({"exp": expires})
        return jwt.encode(encode, self.jwt_secret_key, algorithm=self.jwt_algorithm)

    def validate_new_user(self, db, create_user_request: UserBase) -> None:
        """Shared signup validation: required fields, valid + unique email, unique username."""
        if not create_user_request.username or not create_user_request.password:
            raise HTTPException(status_code=400, detail="Username and password are required")
        if not create_user_request.user_email:
            raise HTTPException(status_code=400, detail="Email is required")

        check_username = (
            db.query(User)
            .filter(func.lower(User.username) == func.lower(create_user_request.username))
            .first()
        )
        if check_username:
            self.logger.info(f"Username must be unique")
            raise HTTPException(status_code=409, detail="Username must be unique")

        if not self.validate_email(create_user_request.user_email):
            raise HTTPException(status_code=409, detail="Please, enter the valid email")

        check_email = (
            db.query(User)
            .filter(func.lower(User.user_email) == func.lower(create_user_request.user_email))
            .first()
        )
        if check_email:
            self.logger.info(f"Email must be unique")
            raise HTTPException(status_code=409, detail="Email must be unique")

    def validate_email(self, email: str) -> bool:
        self.logger.info(f"inside validate_email method..........email: {email}")
        email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return re.match(email_pattern, email) is not None

    def verify_google_token(self, credential: str) -> dict:
        """Verify a Google ID token and return its claims."""
        if not self.google_client_id:
            raise HTTPException(
                status_code=500, detail="Google login is not configured on the server"
            )
        try:
            return google_id_token.verify_oauth2_token(
                credential, google_requests.Request(), self.google_client_id
            )
        except ValueError:
            self.logger.exception("Invalid Google token.")
            raise HTTPException(status_code=401, detail="Invalid Google token")

    async def get_current_user(self, token: Annotated[str, Depends(oauth2_bearer)]) -> dict:
        try:
            payload = jwt.decode(token, self.jwt_secret_key, algorithms=[self.jwt_algorithm])
            username: str = payload.get("sub")
            user_id: int = payload.get("id")
            user_role: str = payload.get("role")
            # Refresh/reset tokens must never be accepted as access tokens
            if payload.get("type") not in (None, "access") or username is None or user_id is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Could not validate user",
                )

            return {"username": username, "id": user_id, "user_role": user_role}
        except JWTError:
            self.logger.exception("Error occurred while getting current user.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate user",
            )

    async def get_optional_user(
        self, token: Annotated[Optional[str], Depends(oauth2_bearer_optional)]
    ) -> Optional[dict]:
        """Like get_current_user, but returns None instead of 401 when not logged in."""
        if not token:
            return None
        try:
            return await self.get_current_user(token)
        except HTTPException:
            return None

    def setup_routes(self):
        @self.router.post("/admin", status_code=status.HTTP_201_CREATED)
        async def create_admin_user(
            db: db_dependency,
            create_user_request: UserBase,
            user: Annotated[Optional[dict], Depends(self.get_optional_user)],
        ):
            """Create a user with any role. Admin-only — except the very first call:
            while no admin exists in the database, this route is open for bootstrap."""
            self.logger.info(
                f"inside create_admin_user method..........username: {create_user_request.username}"
            )
            admin_exists = db.query(User).filter(User.role == UserRole.ADMIN).first() is not None
            if admin_exists and (not user or user.get("user_role") != UserRole.ADMIN.value):
                raise HTTPException(status_code=403, detail="Admin access required")

            self.validate_new_user(db, create_user_request)

            try:
                role = UserRole(create_user_request.role or "customer")
            except ValueError:
                raise HTTPException(status_code=400, detail="Role must be 'customer' or 'admin'")

            check_password = PasswordValidator().validate_password(create_user_request.password)
            if check_password:
                create_user_model = User(
                    username=create_user_request.username,
                    user_email=create_user_request.user_email,
                    user_address=create_user_request.user_address,
                    phone_number=create_user_request.phone_number,
                    hashed_password=bcrypt_context.hash(create_user_request.password),
                    role=role,
                    auth_provider="email",
                    is_active=True,
                    created_at=get_current_datetime(),
                )

                db.add(create_user_model)
                db.commit()
                db.refresh(create_user_model)
                log_activity(
                    db,
                    "user_created",
                    create_user_model.id,
                    f"New {role.value} account created: {create_user_model.user_email}",
                )
                return {"detail": "User created successfully"}

        @self.router.post("/register", status_code=status.HTTP_201_CREATED)
        async def register(db: db_dependency, create_user_request: UserBase, request: Request):
            """Public signup: always creates a customer account."""
            self.logger.info(
                f"inside register method..........username: {create_user_request.username}"
            )
            signup_rate_limiter.check(client_ip(request))
            self.validate_new_user(db, create_user_request)
            PasswordValidator().validate_password(create_user_request.password)
            create_user_model = User(
                username=create_user_request.username,
                user_email=create_user_request.user_email,
                user_address=create_user_request.user_address,
                phone_number=create_user_request.phone_number,
                hashed_password=bcrypt_context.hash(create_user_request.password),
                role=UserRole.CUSTOMER,
                auth_provider="email",
                is_active=True,
                created_at=get_current_datetime(),
            )
            db.add(create_user_model)
            db.commit()
            db.refresh(create_user_model)
            log_activity(
                db,
                "signup",
                create_user_model.id,
                f"New customer account: {create_user_model.user_email}",
            )
            return {"detail": "Account created successfully"}

        @self.router.post("/token", response_model=Token)
        async def login_for_access_token(
            request: Request,
            form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
            db: db_dependency,
        ) -> dict:
            self.logger.info(
                f"inside login_for_access_token method..........username: {form_data.username}"
            )
            client_ip = request.client.host if request.client else "unknown"
            rate_key = f"{form_data.username.lower()}:{client_ip}"
            login_rate_limiter.check(rate_key)

            user = self.authenticate_user(form_data.username, form_data.password, db)
            if not user:
                login_rate_limiter.record_failure(rate_key)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Could not validate user",
                )
            login_rate_limiter.reset(rate_key)
            token = self.create_access_token(
                user.username,
                user.id,
                user.role,
                timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
            )
            refresh_token = self.create_access_token(
                user.username,
                user.id,
                user.role,
                timedelta(minutes=REFRESH_TOKEN_EXPIRE_MINUTES),
                token_type="refresh",
            )
            log_activity(db, "login", user.id, f"{user.user_email} logged in")
            return {
                "access_token": token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "role": user.role.value,
            }

        @self.router.post("/refresh", response_model=Token)
        async def refresh_access_token(body: RefreshRequest, db: db_dependency) -> dict:
            """Exchange a valid refresh token for a new access token."""
            self.logger.info(f"inside refresh_access_token method..........")
            try:
                payload = jwt.decode(
                    body.refresh_token, self.jwt_secret_key, algorithms=[self.jwt_algorithm]
                )
            except JWTError:
                raise HTTPException(status_code=401, detail="Invalid refresh token")
            if payload.get("type") != "refresh":
                raise HTTPException(status_code=401, detail="Invalid refresh token")
            user = (
                db.query(User)
                .filter(User.id == payload.get("id"))
                .filter(User.is_active.isnot(False))  # NULL counts as active
                .first()
            )
            if not user:
                raise HTTPException(status_code=401, detail="Invalid refresh token")
            token = self.create_access_token(
                user.username,
                user.id,
                user.role,
                timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
            )
            return {
                "access_token": token,
                "refresh_token": body.refresh_token,
                "token_type": "bearer",
                "role": user.role.value,
            }

        @self.router.put("/change-password")
        async def change_password(
            body: UserChangePassword,
            db: db_dependency,
            user: Annotated[dict, Depends(self.get_current_user)],
        ):
            """Logged-in user changes their own password (old password required)."""
            self.logger.info(
                f"inside change_password method..........username: {user['username']}"
            )
            user_row = (
                db.query(User)
                .filter(User.id == user["id"])
                .filter(User.is_active.isnot(False))  # NULL counts as active
                .first()
            )
            if not user_row:
                raise HTTPException(status_code=401, detail="Could not validate user")
            if not user_row.hashed_password or not bcrypt_context.verify(
                body.old_password, user_row.hashed_password
            ):
                raise HTTPException(status_code=401, detail="Current password is incorrect")
            PasswordValidator().validate_password(body.new_password)
            user_row.hashed_password = bcrypt_context.hash(body.new_password)
            user_row.is_password_changed = True
            user_row.modified_at = get_current_datetime()
            db.commit()
            log_activity(
                db,
                "password_changed",
                user_row.id,
                f"{user_row.user_email} changed their password",
            )
            return {"detail": "Password changed successfully"}

        @self.router.post("/forgot-password")
        async def forgot_password(
            body: ForgotPasswordRequest,
            db: db_dependency,
            request: Request,
            background_tasks: BackgroundTasks,
        ):
            """Email a short-lived reset link. Response never reveals whether the email exists."""
            self.logger.info(f"inside forgot_password method..........")
            forgot_password_rate_limiter.check(client_ip(request))
            user = (
                db.query(User)
                .filter(func.lower(User.user_email) == body.email.lower())
                .filter(User.is_active.isnot(False))  # NULL counts as active
                .first()
            )
            if user and user.hashed_password:  # Google-only accounts have no password to reset
                reset_token = self.create_access_token(
                    user.username,
                    user.id,
                    user.role,
                    timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES),
                    token_type="reset",
                )
                reset_link = f"{self.frontend_url}/reset-password?token={reset_token}"
                background_tasks.add_task(
                    EmailUtils().send_transactional_email,
                    to=user.user_email,
                    subject_request="Reset your password",
                    message_request=(
                        f"Hello {user.username},\n\n"
                        f"Use the link below to reset your password "
                        f"(valid for {RESET_TOKEN_EXPIRE_MINUTES} minutes):\n\n{reset_link}\n\n"
                        f"If you didn't request this, you can safely ignore this email."
                    ),
                )
                log_activity(
                    db,
                    "password_reset_requested",
                    user.id,
                    f"Reset link sent to {user.user_email}",
                )
            return {"detail": "If that email exists, a password reset link has been sent"}

        @self.router.post("/reset-password")
        async def reset_password(body: ResetPasswordRequest, db: db_dependency):
            """Set a new password using the token from the reset email."""
            self.logger.info(f"inside reset_password method..........")
            try:
                payload = jwt.decode(
                    body.token, self.jwt_secret_key, algorithms=[self.jwt_algorithm]
                )
            except JWTError:
                raise HTTPException(status_code=401, detail="Invalid or expired reset token")
            if payload.get("type") != "reset":
                raise HTTPException(status_code=401, detail="Invalid or expired reset token")
            user = (
                db.query(User)
                .filter(User.id == payload.get("id"))
                .filter(User.is_active.isnot(False))  # NULL counts as active
                .first()
            )
            if not user:
                raise HTTPException(status_code=401, detail="Invalid or expired reset token")
            PasswordValidator().validate_password(body.new_password)
            user.hashed_password = bcrypt_context.hash(body.new_password)
            user.is_password_changed = True
            user.modified_at = get_current_datetime()
            db.commit()
            log_activity(db, "password_reset", user.id, f"{user.user_email} reset their password")
            return {"detail": "Password reset successfully"}

        @self.router.post("/google", response_model=TokenResponse)
        async def get_google_login(body: GoogleLoginRequest, db: db_dependency):
            self.logger.info(f"inside get_google_login method..........")
            claims = self.verify_google_token(body.credential)
            email = claims.get("email", "").lower()
            if not email:
                raise HTTPException(status_code=401, detail="Google account has no email")

            user = db.query(User).filter(func.lower(User.user_email) == email).first()
            if not user:
                user = User(
                    username=email.split("@")[0],
                    user_email=email,
                    hashed_password=None,  # Google-only account
                    role=UserRole.CUSTOMER,
                    auth_provider="google",
                    is_active=True,
                    created_at=get_current_datetime(),
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                log_activity(db, "signup", user.id, f"New account via Google: {user.user_email}")
            if user.is_active is False:  # NULL counts as active
                raise HTTPException(status_code=403, detail="Account is deactivated")
            token = self.create_access_token(
                user.username,
                user.id,
                user.role,
                timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
            )
            refresh_token = self.create_access_token(
                user.username,
                user.id,
                user.role,
                timedelta(minutes=REFRESH_TOKEN_EXPIRE_MINUTES),
                token_type="refresh",
            )
            log_activity(db, "login", user.id, f"{user.user_email} logged in via Google")
            return TokenResponse(
                access_token=token,
                refresh_token=refresh_token,
                user=UserOut.model_validate(user),
            )


class PasswordValidator:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()

    def validate_password(self, password) -> bool:
        self.logger.info(f"inside validate_password method..........password")
        self.validate_length(password)
        self.validate_special_character_at_start(password)
        self.validate_special_character(password)
        self.validate_capital_character(password)
        self.validate_digit(password)
        return True

    def validate_length(self, password):
        self.logger.info(f"inside validate_length method..........password")
        if len(password) < 8:
            raise HTTPException(
                status_code=409,
                detail={
                    "error_field": "password",
                    "detail": "Password must be a minimum of 8 characters.",
                },
            )

    def validate_special_character_at_start(self, password):
        self.logger.info(f"inside validate_special_character_at_start method..........password")
        if password[0] in string.punctuation:
            raise HTTPException(
                status_code=409,
                detail={
                    "error_field": "password",
                    "detail": "Password cannot start with a special character.",
                },
            )

    def validate_special_character(self, password):
        self.logger.info(f"inside validate_special_character method..........password")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            raise HTTPException(
                status_code=409,
                detail={
                    "error_field": "password",
                    "detail": "Password must contain at least one special character.",
                },
            )

    def validate_capital_character(self, password):
        self.logger.info(f"inside validate_capital_character method..........password")
        if not re.search(r"[A-Z]", password):
            raise HTTPException(
                status_code=409,
                detail={
                    "error_field": "password",
                    "detail": "Password must contain at least one capital character.",
                },
            )

    def validate_digit(self, password: str):
        """
        Checks if a password contains at least one digit and raises an exception if it doesn't.

        Args:
            password (str) : String to check if it contains at least one digit.
        """
        self.logger.info(f"inside validate_digit method..........password")
        if not re.search(r"\d", password):
            raise HTTPException(
                status_code=409,
                detail={
                    "error_field": "password",
                    "detail": "Password must contain at least one digit.",
                },
            )


auth_router = UserRouter()
user_dependency = Annotated[dict, Depends(auth_router.get_current_user)]
optional_user_dependency = Annotated[Optional[dict], Depends(auth_router.get_optional_user)]


def require_admin(user: user_dependency) -> dict:
    """Dependency: allow only authenticated users with the admin role."""
    if user.get("user_role") != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


admin_dependency = Annotated[dict, Depends(require_admin)]
