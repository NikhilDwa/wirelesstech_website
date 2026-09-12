# Wireless Tech — Backend

FastAPI service behind the Wireless Tech storefront: product catalogue, cash-on-delivery
orders, image uploads, repair/contact enquiries, and an admin panel API. Data lives in
PostgreSQL via SQLAlchemy; transactional email goes out through Resend.

The React frontend lives in `../frontend` and calls this service with relative paths
(`/api/...`), proxied by Vite in development and by Nginx in production. For server
provisioning see [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

---

## Stack

| Piece | Choice |
|---|---|
| Framework | FastAPI + Uvicorn (Gunicorn workers in production) |
| ORM | SQLAlchemy 2.x, declarative models |
| Database | PostgreSQL (`psycopg2-binary`) |
| Auth | JWT (`python-jose`), bcrypt via `passlib`, Google Sign-In |
| Email | Resend HTTP API |
| Config | YAML file, not environment variables |

---

## Layout

```
backend/
├── main.py                 app assembly: CORS, security headers, routers, /uploads mount
├── requirements.txt
├── config/
│   ├── config_example.yml  committed template
│   └── config.yml          real secrets — gitignored, create this yourself
├── constants/constants.py  page-size constants
├── db/
│   ├── database.py         engine, SessionLocal, get_db dependency
│   ├── db_models.py        SQLAlchemy tables
│   └── base_models.py      Pydantic request/response schemas
├── routers/                one class per router, instantiated at import
│   ├── auth.py             login, signup, tokens, password reset, Google
│   ├── account.py          admin user management
│   ├── categories.py
│   ├── products.py
│   ├── orders.py
│   ├── gallery.py
│   ├── services.py         estimate + contact forms
│   └── activities.py       admin audit log
├── utils/
│   ├── path_utils.py       base path, config loader, log paths
│   ├── generic_utils.py    DB URL, timestamps, activity logging, rate limiter
│   ├── logger_utils.py     rotating per-module loggers
│   └── email_utils.py      Resend wrapper
├── logs/                   runtime, gitignored
└── uploads/                runtime, gitignored
    ├── products/
    └── gallery/
```

Each router is a class whose `__init__` builds an `APIRouter` and calls `setup_routes()`.
The module ends by instantiating it (`product_router = ProductRouter()`), and `main.py`
includes `product_router.router`.

---

## Setup

### 1. Python environment

Requires Python 3.10+ (3.12 is what the checked-in bytecode was built with).

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

Using pyenv-virtualenv instead:

```bash
pyenv activate myenv
pip install -r requirements.txt
```

### 2. PostgreSQL

Create the database and a role for it:

```sql
CREATE DATABASE wireless_tech_db;
CREATE USER wireless_tech WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE wireless_tech_db TO wireless_tech;
\c wireless_tech_db
GRANT ALL ON SCHEMA public TO wireless_tech;
```

That last grant matters on PostgreSQL 15 and newer: ordinary users no longer get `CREATE`
on the `public` schema by default, even when they own the database. Without it the app
crashes at startup with `permission denied for schema public` while creating its tables.

### 3. Configuration

```bash
cp config/config_example.yml config/config.yml
```

Then fill it in. `config.yml` holds live secrets and is gitignored — never commit it.

| Block | Key | Notes |
|---|---|---|
| `APPS` | `log_level` | `DEBUG` / `INFO` / `WARNING`; blank falls back to `INFO` |
| | `host`, `port` | Bind address for `python main.py`. Use `127.0.0.1` / `8000` behind Nginx |
| | `frontend_url` | Base for password-reset links. Defaults to `http://localhost:3000` |
| `CORS` | `allowed_origins` | YAML list of origins. Same-origin deploys can leave it minimal |
| `JWT` | `SECRET_KEY` | Generate fresh: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| | `ALGORITHM` | `HS256` |
| `GOOGLE` | `CLIENT_ID` | OAuth client id; must match the frontend's. Blank disables Google login |
| `POSTGRESQL_DATABASE` | `postgresql_user`, `password`, `hostname`, `database` | Assembled into `postgresql://user:password@hostname/database` |
| `RESEND` | `api_key` | Blank means email is skipped and logged as an error, not raised |
| | `from` | Verified sender. Falls back to `CRON_EMAIL.from` if unset |
| `CRON_EMAIL` | `report_to` | Where contact-form and repair-estimate enquiries are delivered |
| | `to` | Shop alerts for every order event. Blank switches order alerts off |
| | `from` | Sender fallback when `RESEND.from` is blank. Must be a single address |
| | `error_to`, `transaction_alert_to` | Reserved — nothing reads them yet |

Every `*_to` field accepts one address, a YAML list, or a comma-separated string —
`utils/email_utils.py:as_recipients()` normalises all three, trims whitespace, drops blanks
and de-duplicates. `from` is the exception and must stay a single address. Config is read at
import, so any change here needs a service restart.

### 4. Run

```bash
uvicorn main:app --reload            # reads host/port from uvicorn's defaults
python main.py                       # reads host/port from config.yml
```

Interactive API docs come free at `http://127.0.0.1:8000/docs`.

### 5. Create the first admin

`POST /api/auth/admin` is open **only while no admin row exists** in the database. Once one
does, it requires an admin token. Use it immediately after the first deploy:

```bash
curl -X POST http://127.0.0.1:8000/api/auth/admin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","user_email":"you@example.com","password":"Str0ng!pass","role":"admin"}'
```

---

## Database

### Schema management

There is no Alembic. On startup `main.py` calls `Base.metadata.create_all(bind=engine)`,
which creates any table that does not exist but never alters one that does. Column
additions to existing tables are handled by `run_light_migrations()` in `main.py` — a
hand-written, idempotent function that inspects the table first. It currently backfills
`order_items.image_url`.

**Adding a column to an existing table means adding a step to that function**, or the
column will exist in the model and not in the database. Migrating to Alembic is the
recommended fix before the schema changes much further.

### Connection pool

`db/database.py` sets `pool_pre_ping=True` (tests a connection before handing it out, so
idle-timed-out sockets don't surface as `server closed the connection unexpectedly`) and
`pool_recycle=1800` (drops connections after 30 minutes, ahead of most server-side idle
timeouts). Request handlers take the `db_dependency` annotation, which yields a session and
closes it afterwards.

### Tables

**`users`**

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `username` | varchar(120) unique, nullable | Login identifier for password auth |
| `user_email` | varchar(255) unique, not null | |
| `user_address`, `phone_number` | varchar | Optional |
| `hashed_password` | varchar, nullable | Null for Google-only accounts |
| `is_password_changed` | bool | Set once the user changes or resets it |
| `role` | enum | `ADMIN` / `CUSTOMER` |
| `auth_provider` | varchar(20) | `email` or `google` |
| `is_active` | bool, nullable | **NULL counts as active** — see below |
| `created_at`, `modified_at` | timestamptz | |

**`categories`** — `id`, `name` (unique), `is_active`, timestamps.

**`products`** — `id`, `name`, `category_id` → `categories.id`, `description`,
`price` `numeric(10,2)`, `stock` int, `image_url`, `is_active`, timestamps.
Exposes a `category` property returning the category's name for serialization.

**`orders`** — `id`, `user_id` → `users.id`, `total` `numeric(10,2)`,
`order_status` enum (`PENDING` / `CONFIRMED` / `DELIVERED` / `CANCELLED`),
`payment_method` (always `cash_on_delivery` today), `shipping_address`, `phone`,
`is_active`, timestamps. Two derived properties: `status` (the enum's string value) and
`order_number`, a customer-facing reference formatted `WT-YYYYMMDD-00042` from the
creation date and id, so it never repeats.

**`order_items`** — `id`, `order_id` → `orders.id`, `product_id` → `products.id`,
`product_name`, `image_url`, `unit_price`, `quantity`. Name, price and image are
**snapshots taken at order time**, so later edits to a product don't rewrite order history.

**`gallery_images`** — `id`, `title`, `image_url`, `is_active`, timestamps.

**`activities`** — `id`, `user_id` (nullable, null = anonymous), `action`, `detail`,
`is_active`, timestamps. Written by `log_activity()` in `utils/generic_utils.py`.

### Relationships

```
User ─1:N─ Order ─1:N─ OrderItem
 │                          │
 └─1:N─ Activity            └─N:1─ Product ─N:1─ Category
```

`Order.items` and `User.orders` cascade `all, delete-orphan`.

### Two conventions worth knowing

**Soft deletes.** Nothing is ever hard-deleted. `DELETE` endpoints set `is_active = False`;
restoring is a `PUT` setting it back to `True`. Queries filter with
`.filter(Model.is_active.isnot(False))` rather than `== True`, so rows written before the
column existed (`NULL`) still count as active. Follow that pattern in new queries.

**Activity log.** Anything meaningful — logins, signups, orders, admin edits — calls
`log_activity(db, action, user_id, detail)`, which inserts a row and commits immediately.
Because it commits, don't call it mid-transaction expecting a later rollback to undo it.
Note that product detail views are logged for signed-in users, so this table grows quickly
and is mostly view noise.

### Timestamps

`get_current_datetime()` in `utils/generic_utils.py` defaults to **`America/New_York`**, not
UTC. Values are timezone-aware, so they store correctly, but be deliberate about the
timezone argument when adding code.

---

## API

All routes are prefixed `/api`. Auth is a bearer token: `Authorization: Bearer <access_token>`.

### `/api/auth`

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/admin` | Open until first admin exists, then admin | Create a user with any role |
| POST | `/register` | Public | Customer signup (8/hour/IP) |
| POST | `/token` | Public | OAuth2 password form → access + refresh |
| POST | `/refresh` | Public | Exchange refresh token for a new access token |
| PUT | `/change-password` | User | Requires the current password |
| POST | `/forgot-password` | Public | Emails a reset link (8/hour/IP) |
| POST | `/reset-password` | Public | Consumes the emailed token |
| POST | `/google` | Public | Verify a Google ID token, create or sign in |

### `/api/products`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `` | Public | `category_id`, `min_price`, `max_price`, `search`, `sort`, `skip`, `limit`≤100, `include_inactive` (admin) |
| GET | `/{id}` | Public | Soft-deleted products 404 for non-admins |
| POST | `/upload-image` | Admin | Multipart upload → `{"image_url": "/uploads/products/<uuid>.jpg"}` |
| POST | `` | Admin | Create |
| PUT | `/{id}` | Admin | Partial update; `{"is_active": true}` restores |
| DELETE | `/{id}` | Admin | Soft delete |

`sort` accepts `recent`, `price_asc`, `price_desc`.

### `/api/categories`

`GET` (public, `include_inactive` for admins), `POST`, `PUT /{id}`, `DELETE /{id}` (admin).
Creating a category whose name matches a soft-deleted one restores that row rather than
inserting a duplicate.

### `/api/orders`

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `` | User | Place a cash-on-delivery order |
| PUT | `/{id}/cancel` | User | Own order, pending only; stock is restored |
| GET | `/my` | User | Own order history |
| GET | `` | Admin | All orders; `status` filter accepts the four statuses or `needs_attention` |
| GET | `/counts` | Admin | Counts per status, powers the admin badge |
| PUT | `/{id}/status` | Admin | Delivered and cancelled are terminal; moving to cancelled restores stock |

Order placement locks each product row with `SELECT ... FOR UPDATE` before decrementing
stock, so two simultaneous checkouts cannot both claim the last unit.

**Emails.** All three write-endpoints send two messages in background tasks: a short one to
the customer, and a full breakdown to the shop addresses in `CRON_EMAIL.to` (order number,
status, total, customer, phone, shipping address, itemised lines). `order_summary()` builds
that text **synchronously**, before the task is queued — `order.items` would fail to
lazy-load inside the task, once the request's DB session has closed. Keep that ordering if
you add another alert.

### `/api/gallery`

`GET` (public, `include_inactive` for admins), `POST` multipart (admin),
`PUT /{id}` restore (admin), `DELETE /{id}` soft delete (admin).

### `/api/account` — admin only

`GET` list users, `PUT /{id}` edit role/details/active flag, `DELETE /{id}` deactivate.
Admins cannot deactivate or delete their own account.

### `/api/activities` — admin only

`GET` with optional `user_id`, `username` (partial match), `action`, `skip`, `limit`≤500,
plus `GET /actions` for the distinct action names, for filter dropdowns.

### `/api/services` — public

`POST /estimate` and `POST /contact`. Both email `CRON_EMAIL.report_to` in a background
task, log an activity row, and are rate-limited to 8 per IP per hour.

### Static files

`/uploads/...` is mounted from `backend/uploads/` and serves product and gallery images.
In production Nginx serves this path directly instead of routing through Python.

---

## Auth model

**Tokens.** Access tokens last 60 minutes, refresh tokens 7 days, password-reset tokens 30
minutes. Every token carries a `type` claim (`access` / `refresh` / `reset`) and
`get_current_user` rejects anything that is not an access token, so a refresh token can't be
used as a credential.

**Password rules** (`PasswordValidator` in `routers/auth.py`): at least 8 characters, must
not start with a special character, and must contain at least one uppercase letter, one
digit, and one special character.

**Rate limits.** Login allows 5 failed attempts per username+IP per 15 minutes; signup,
forgot-password, and the service forms allow 8 requests per IP per hour. These limiters are
**in-memory and per-process** — running multiple Gunicorn workers multiplies every limit by
the worker count. Move them to Redis if you scale out.

**Dependencies** exported from `routers/auth.py` for use in other routers:

- `user_dependency` — any authenticated user
- `admin_dependency` — authenticated with the admin role
- `optional_user_dependency` — the user if signed in, otherwise `None`

---

## Logging

`Logger(name, filename)` returns a logger writing to both stdout and
`logs/<name>.log`, rotating at 50 MB with 15 backups. Each router creates one named after
its class, so `logs/OrderRouter.log` holds that router's output. The level comes from
`APPS.log_level`. Passwords are never logged; keep it that way.

---

## Known gaps

Documented so they aren't rediscovered the hard way:

- **No migrations.** See the schema management note above.
- **No tests.**
- **Google sign-in doesn't check `email_verified`**, and derives the username from the email
  prefix, which raises a 500 on collision with an existing username.
- **Deactivating a user isn't immediate.** `/refresh` re-checks `is_active`, but a live
  access token stays valid for up to an hour.
- **Client IP detection** uses `request.client.host`, which behind Nginx or Cloudflare is the
  proxy's address, not the visitor's — so the rate limiters bucket real users together.
- **Uploads are validated by file extension only**, with no content-type or magic-byte check.
- **Order listings are N+1.** `backfill_item_images` lazy-loads `order.items` per order;
  `selectinload` would fix it.
- **Files for soft-deleted products and gallery images stay on disk** — `uploads/` only grows.
