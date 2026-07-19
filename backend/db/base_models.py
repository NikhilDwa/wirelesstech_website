from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

from db.db_models import UserRole


class GoogleLoginRequest(BaseModel):
    credential: str  # Google ID token from the frontend


class UserOut(BaseModel):
    id: int
    username: Optional[str] = None
    user_email: EmailStr
    role: UserRole
    auth_provider: str
    user_address: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: Optional[bool] = True
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserOut


class UserBase(BaseModel):
    username: Optional[str] = Field(None, max_length=120)
    user_email: Optional[str] = Field(None, max_length=255)
    user_address: Optional[str] = Field(None, max_length=500)
    phone_number: Optional[str] = Field(None, max_length=30)
    password: Optional[str] = Field(None, max_length=200)
    role: Optional[str] = None

    class Config:
        from_attributes = True


class UserAdminUpdate(BaseModel):
    """Fields an admin may change on any user account."""

    username: Optional[str] = Field(None, max_length=120)
    user_email: Optional[str] = Field(None, max_length=255)
    user_address: Optional[str] = Field(None, max_length=500)
    phone_number: Optional[str] = Field(None, max_length=30)
    role: Optional[str] = None
    is_active: Optional[bool] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    role: str

    class Config:
        from_attributes = True


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., max_length=200)


class UserChangePassword(BaseModel):
    old_password: str = Field(..., max_length=200)
    new_password: str = Field(..., max_length=200)

    class Config:
        from_attributes = True


# ---------- Categories ----------


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)


class CategoryOut(BaseModel):
    id: int
    name: str
    is_active: Optional[bool] = True

    class Config:
        from_attributes = True


# ---------- Products ----------


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category_id: int
    description: Optional[str] = Field("", max_length=5000)
    price: float = Field(..., ge=0, le=1_000_000)
    stock: int = Field(0, ge=0, le=1_000_000)
    image_url: Optional[str] = Field("", max_length=500)


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=5000)
    price: Optional[float] = Field(None, ge=0, le=1_000_000)
    stock: Optional[int] = Field(None, ge=0, le=1_000_000)
    image_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    id: int
    name: str
    category_id: Optional[int] = None
    category: str = ""
    description: Optional[str] = ""
    price: float
    stock: int
    image_url: Optional[str] = ""
    is_active: Optional[bool] = True
    created_at: datetime

    class Config:
        from_attributes = True


class ProductListOut(BaseModel):
    items: List[ProductOut]
    total: int


# ---------- Orders ----------


class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(1, ge=1, le=1000)


class OrderItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    image_url: Optional[str] = ""
    unit_price: float
    quantity: int

    class Config:
        from_attributes = True


class OrderCreate(BaseModel):
    shipping_address: str = Field(..., min_length=1, max_length=1000)
    phone: Optional[str] = Field("", max_length=30)
    items: List[OrderItemIn] = Field(..., min_length=1, max_length=100)


class OrderStatusUpdate(BaseModel):
    status: str


class OrderOut(BaseModel):
    id: int
    order_number: str
    user_id: int
    total: float
    status: str
    payment_method: str
    shipping_address: str
    phone: Optional[str] = ""
    created_at: datetime
    items: List[OrderItemOut] = []

    class Config:
        from_attributes = True


class OrderCountsOut(BaseModel):
    """Order counts by status, for the admin notification badge + filter pills."""

    pending: int = 0
    confirmed: int = 0
    delivered: int = 0
    cancelled: int = 0
    needs_attention: int = 0  # pending + confirmed — orders not yet delivered or cancelled


# ---------- Gallery ----------


class GalleryImageOut(BaseModel):
    id: int
    title: Optional[str] = ""
    image_url: str
    is_active: Optional[bool] = True
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Activities ----------


class ActivityOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_name: str
    action: str
    detail: str
    created_at: datetime

    class Config:
        from_attributes = True
