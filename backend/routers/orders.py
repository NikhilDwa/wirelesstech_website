from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlalchemy import func

from db.database import db_dependency
from db.db_models import Order, OrderItem, OrderStatus, Product, User
from db.base_models import OrderCountsOut, OrderCreate, OrderOut, OrderStatusUpdate
from utils.logger_utils import Logger
from utils.email_utils import EmailUtils
from utils.generic_utils import get_current_datetime, log_activity
from routers.auth import admin_dependency, user_dependency

VALID_STATUSES = tuple(s.value for s in OrderStatus)
FINAL_STATUSES = (OrderStatus.DELIVERED, OrderStatus.CANCELLED)


class OrderRouter:
    def __init__(self):
        log_namespace = self.__class__.__name__
        self.logger = Logger(log_namespace, f"{log_namespace}.log").get()
        self.router = APIRouter(
            prefix="/api/orders",
            tags=["orders"],
            responses={404: {"description": "Not found"}},
        )
        self.setup_routes()

    def send_order_email(self, to_email: str, subject: str, message: str) -> None:
        """Send an order notification; failures are logged but never break the request."""
        try:
            EmailUtils().send_transactional_email(
                to=to_email, subject_request=subject, message_request=message
            )
        except Exception:
            self.logger.exception("Failed to send order email.")

    def backfill_item_images(self, db, orders: list[Order]) -> list[Order]:
        """Orders placed before the image snapshot was added have a blank
        item.image_url. Fill those in (best effort) from the current product
        photo, without touching the stored snapshot for newer orders."""
        missing_ids = {
            item.product_id for order in orders for item in order.items if not item.image_url
        }
        if missing_ids:
            photos = {
                p.id: p.image_url
                for p in db.query(Product).filter(Product.id.in_(missing_ids)).all()
            }
            for order in orders:
                for item in order.items:
                    if not item.image_url:
                        item.image_url = photos.get(item.product_id, "")
        return orders

    def restore_stock(self, db, order: Order) -> None:
        """Put an order's quantities back into product stock (used on cancellation)."""
        for item in order.items:
            product = (
                db.query(Product).filter(Product.id == item.product_id).with_for_update().first()
            )
            if product:
                product.stock += item.quantity

    def setup_routes(self):
        @self.router.post("", response_model=OrderOut, status_code=201)
        async def create_order(
            body: OrderCreate,
            db: db_dependency,
            user: user_dependency,
            background_tasks: BackgroundTasks,
        ):
            """Place a cash-on-delivery order. Requires login."""
            self.logger.info(
                f"inside create_order method..........user: {user['username']}, items: {len(body.items)}"
            )
            if not body.items:
                raise HTTPException(status_code=400, detail="Cart is empty")
            if not body.shipping_address or not body.shipping_address.strip():
                raise HTTPException(status_code=400, detail="Shipping address is required")

            order = Order(
                user_id=user["id"],
                total=0,
                order_status=OrderStatus.PENDING,
                payment_method="cash_on_delivery",
                shipping_address=body.shipping_address,
                phone=body.phone or "",
                is_active=True,
                created_at=get_current_datetime(),
            )
            total = Decimal("0")
            for item in body.items:
                # with_for_update() locks the row so two simultaneous orders
                # can't both take the last unit (no overselling)
                product = (
                    db.query(Product)
                    .filter(Product.id == item.product_id)
                    .with_for_update()
                    .first()
                )
                if not product or product.is_active is False:
                    # Soft-deleted products can't be ordered (NULL is_active counts as active)
                    raise HTTPException(
                        status_code=404, detail=f"Product {item.product_id} not found"
                    )
                if product.stock < item.quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Not enough stock for '{product.name}' (available: {product.stock})",
                    )
                product.stock -= item.quantity
                total += Decimal(str(product.price)) * item.quantity
                order.items.append(
                    OrderItem(
                        product_id=product.id,
                        product_name=product.name,
                        image_url=product.image_url,
                        unit_price=product.price,
                        quantity=item.quantity,
                    )
                )

            order.total = total
            db.add(order)
            db.commit()
            db.refresh(order)
            log_activity(
                db,
                "order_placed",
                user["id"],
                f"Order {order.order_number}, {len(order.items)} item(s), total ${order.total:.2f}",
            )
            user_row = db.query(User).filter(User.id == user["id"]).first()
            if user_row:
                items_text = "\n".join(
                    f"  - {i.product_name} x{i.quantity} @ ${i.unit_price}" for i in order.items
                )
                background_tasks.add_task(
                    self.send_order_email,
                    user_row.user_email,
                    f"Order {order.order_number} received",
                    (
                        f"Hi {user_row.username},\n\n"
                        f"Thanks for your order! Here's a summary:\n\n{items_text}\n\n"
                        f"Order number: {order.order_number}\n"
                        f"Total: ${order.total:.2f}\n"
                        f"Payment: cash on delivery\n"
                        f"Shipping to: {order.shipping_address}\n\n"
                        f"We'll email you when the status changes."
                    ),
                )
            return order

        @self.router.put("/{order_id}/cancel", response_model=OrderOut)
        async def cancel_order(
            order_id: int,
            db: db_dependency,
            user: user_dependency,
            background_tasks: BackgroundTasks,
        ):
            """Customer cancels their own order while it is still pending. Stock is restored."""
            self.logger.info(
                f"inside cancel_order method..........order_id: {order_id}, user: {user['username']}"
            )
            order = (
                db.query(Order)
                .filter(Order.id == order_id)
                .filter(Order.user_id == user["id"])
                .first()
            )
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            if order.order_status != OrderStatus.PENDING:
                raise HTTPException(
                    status_code=400,
                    detail=f"Only pending orders can be cancelled (this one is '{order.status}')",
                )
            self.restore_stock(db, order)
            order.order_status = OrderStatus.CANCELLED
            order.modified_at = get_current_datetime()
            db.commit()
            db.refresh(order)
            log_activity(
                db, "order_cancelled", user["id"], f"Customer cancelled order {order.order_number}"
            )
            user_row = db.query(User).filter(User.id == user["id"]).first()
            if user_row:
                background_tasks.add_task(
                    self.send_order_email,
                    user_row.user_email,
                    f"Order {order.order_number} cancelled",
                    f"Your order {order.order_number} has been cancelled and the items "
                    f"returned to stock.",
                )
            return order

        @self.router.get("/my", response_model=list[OrderOut])
        async def my_orders(
            db: db_dependency,
            user: user_dependency,
            skip: int = Query(0, ge=0),
            limit: int = Query(200, ge=1, le=500),
        ):
            self.logger.info(f"inside my_orders method..........user: {user['username']}")
            orders = (
                db.query(Order)
                .filter(Order.user_id == user["id"])
                .order_by(Order.created_at.desc())
                .offset(skip)
                .limit(limit)
                .all()
            )
            return self.backfill_item_images(db, orders)

        # ---------- Admin only ----------

        @self.router.get("/counts", response_model=OrderCountsOut)
        async def order_counts(db: db_dependency, admin: admin_dependency):
            """Order counts by status — powers the admin notification badge and filter pills."""
            self.logger.info(
                f"inside order_counts method..........requested by admin: {admin['username']}"
            )
            rows = (
                db.query(Order.order_status, func.count(Order.id))
                .group_by(Order.order_status)
                .all()
            )
            counts = {s.value: 0 for s in OrderStatus}
            for status_enum, count in rows:
                counts[status_enum.value] = count
            return OrderCountsOut(
                pending=counts["pending"],
                confirmed=counts["confirmed"],
                delivered=counts["delivered"],
                cancelled=counts["cancelled"],
                needs_attention=counts["pending"] + counts["confirmed"],
            )

        @self.router.get("", response_model=list[OrderOut])
        async def all_orders(
            db: db_dependency,
            admin: admin_dependency,
            status: Optional[str] = None,
            skip: int = Query(0, ge=0),
            limit: int = Query(200, ge=1, le=500),
        ):
            self.logger.info(
                f"inside all_orders method..........requested by admin: {admin['username']}, status: {status}"
            )
            q = db.query(Order)
            if status:
                if status == "needs_attention":
                    q = q.filter(
                        Order.order_status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED])
                    )
                else:
                    try:
                        status_enum = OrderStatus(status)
                    except ValueError:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Status must be one of {VALID_STATUSES} or 'needs_attention'",
                        )
                    q = q.filter(Order.order_status == status_enum)
            orders = q.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()
            return self.backfill_item_images(db, orders)

        @self.router.put("/{order_id}/status", response_model=OrderOut)
        async def update_status(
            order_id: int,
            body: OrderStatusUpdate,
            db: db_dependency,
            admin: admin_dependency,
            background_tasks: BackgroundTasks,
        ):
            self.logger.info(
                f"inside update_status method..........order_id: {order_id}, status: {body.status}, "
                f"requested by admin: {admin['username']}"
            )
            try:
                new_status = OrderStatus(body.status)
            except ValueError:
                raise HTTPException(
                    status_code=400, detail=f"Status must be one of {VALID_STATUSES}"
                )
            order = db.query(Order).filter(Order.id == order_id).first()
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            if order.order_status == new_status:
                return order
            if order.order_status in FINAL_STATUSES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Order is already '{order.status}' and cannot be changed",
                )
            if new_status == OrderStatus.CANCELLED:
                self.restore_stock(db, order)
            order.order_status = new_status
            order.modified_at = get_current_datetime()
            db.commit()
            db.refresh(order)
            log_activity(
                db,
                "order_status_updated",
                admin["id"],
                f"Order {order.order_number} set to '{order.status}'",
            )
            user_row = db.query(User).filter(User.id == order.user_id).first()
            if user_row:
                background_tasks.add_task(
                    self.send_order_email,
                    user_row.user_email,
                    f"Order {order.order_number} update",
                    f"Hi {user_row.username},\n\n"
                    f"Your order {order.order_number} is now '{order.status}'.",
                )
            return order


order_router = OrderRouter()
