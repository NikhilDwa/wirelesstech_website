import enum

from sqlalchemy.orm import relationship
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    String,
    TIMESTAMP,
    func,
    JSON,
    Integer,
    Numeric,
    Enum,
    Text,
)

from db.database import Base


class UserRole(enum.Enum):
    ADMIN = "admin"
    CUSTOMER = "customer"


class OrderStatus(enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(120), unique=True, index=True, nullable=True)
    user_email = Column(String(255), unique=True, index=True, nullable=False)
    user_address = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)  # null for Google-only accounts
    is_password_changed = Column(Boolean, nullable=True, default=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.CUSTOMER)
    auth_provider = Column(String(20), default="email", nullable=False)  # email | google
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    modified_at = Column(TIMESTAMP(timezone=True), nullable=True)

    orders = relationship("Order", back_populates="user", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="user")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    modified_at = Column(TIMESTAMP(timezone=True), nullable=True)

    products = relationship("Product", back_populates="category_ref")


class Activity(Base):
    """Log of user actions on the website (logins, views, orders, admin changes...)."""

    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id"), nullable=True
    )  # null = anonymous / unknown user
    action = Column(String(50), index=True, nullable=False)
    detail = Column(Text, default="", nullable=False)
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(
        TIMESTAMP(timezone=True), index=True, nullable=False, server_default=func.now()
    )
    modified_at = Column(TIMESTAMP(timezone=True), nullable=True)

    user = relationship("User", back_populates="activities")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)
    description = Column(Text, default="")
    price = Column(Numeric(10, 2), default=0, nullable=False)
    stock = Column(Integer, default=0, nullable=False)
    image_url = Column(String(500), default="")
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(
        TIMESTAMP(timezone=True), index=True, nullable=False, server_default=func.now()
    )
    modified_at = Column(TIMESTAMP(timezone=True), nullable=True)

    category_ref = relationship("Category", back_populates="products")

    @property
    def category(self) -> str:
        """Category name, for convenient serialization."""
        return self.category_ref.name if self.category_ref else ""


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    total = Column(Numeric(10, 2), nullable=False)
    order_status = Column(
        Enum(OrderStatus), nullable=False, default=OrderStatus.PENDING
    )  # pending | confirmed | delivered | cancelled
    payment_method = Column(String(30), default="cash_on_delivery", nullable=False)
    shipping_address = Column(Text, nullable=False)
    phone = Column(String(30), default="")
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(
        TIMESTAMP(timezone=True), index=True, nullable=False, server_default=func.now()
    )
    modified_at = Column(TIMESTAMP(timezone=True), nullable=True)

    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

    @property
    def status(self) -> str:
        """Order status as a plain string, for convenient serialization."""
        return self.order_status.value if self.order_status else ""

    @property
    def order_number(self) -> str:
        """Customer-facing reference, e.g. WT-20260718-00042 (never reuses ids)."""
        date_part = self.created_at.strftime("%Y%m%d") if self.created_at else "00000000"
        return f"WT-{date_part}-{self.id:05d}"


class GalleryImage(Base):
    """Photos shown on the public Gallery page, managed by admins."""

    __tablename__ = "gallery_images"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=True, default="")
    image_url = Column(String(500), nullable=False)
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(
        TIMESTAMP(timezone=True), index=True, nullable=False, server_default=func.now()
    )
    modified_at = Column(TIMESTAMP(timezone=True), nullable=True)


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name = Column(String(200), nullable=False)
    image_url = Column(String(500), default="")
    unit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")
