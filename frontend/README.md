# Wireless Tech — Frontend

React storefront and admin panel for Wireless Tech: catalogue and product pages, cart and
cash-on-delivery checkout, order tracking, repair-estimate and contact forms, a gallery, and
a six-tab admin panel for products, categories, orders, users, gallery and the activity log.

Talks to the FastAPI service in [`../backend`](../backend/README.md) using relative paths
(`/api/...`), so there is no API base URL to configure and no CORS in play — Vite proxies in
development, Nginx does the same in production. Server setup is in
[`../DEPLOYMENT.md`](../DEPLOYMENT.md).

---

## Stack

| Piece | Choice |
|---|---|
| UI | React 18 |
| Build | Vite 8 with `@vitejs/plugin-react` |
| Routing | react-router-dom 6 |
| State | React context — no Redux, no query library |
| Styling | One hand-written `styles.css`, no framework |
| HTTP | `fetch`, wrapped in `src/api.js` |

No TypeScript, no component library, no CSS preprocessor. Dependencies are deliberately
three packages deep.

---

## Layout

```
frontend/
├── index.html              Vite entry; favicon and <title> live here
├── vite.config.js          dev server port + /api and /uploads proxy
├── package.json
├── public/images/          static art shipped as-is (see Static assets below)
└── src/
    ├── main.jsx            router, provider tree, route table
    ├── api.js              fetch wrapper, token storage, auth calls, formatters
    ├── context.jsx         AuthProvider, CartProvider, ConfirmProvider
    ├── components.jsx      every shared component
    ├── config_example.js   committed template
    ├── config.js           shop details + Google client id — gitignored
    ├── styles.css          the entire stylesheet
    └── pages/
        ├── Home.jsx            hero carousel, promos, category tiles
        ├── Shop.jsx            Shop (list + filters) and ProductDetail
        ├── InfoPages.jsx       About, Services, Gallery, Contact
        ├── AuthPages.jsx       Login, Register, Forgot/Reset/ChangePassword
        ├── CustomerPages.jsx   Cart, Checkout, MyOrders
        └── Admin.jsx           the whole admin panel
```

The structure is intentionally flat: files are grouped by role rather than one file per
component, and most export several components. `components.jsx` holds everything shared;
each page file holds the screens that belong together.

---

## Setup

Requires Node 20+.

```bash
cd frontend
npm install
cp src/config_example.js src/config.js   # then edit it
npm run dev
```

Opens on **http://localhost:3000**. The backend must be running on `127.0.0.1:8000` or every
request 502s — start it first (`cd ../backend && uvicorn main:app --reload`).

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload on port 3000 |
| `npm run build` | Production bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` locally to check it |

### The dev proxy

`vite.config.js` forwards `/api` and `/uploads` to `http://127.0.0.1:8000`, so the browser
only ever talks to `localhost:3000` and same-origin rules are never involved. It also sets
`host: true`, binding all interfaces — this fixes the IPv6-vs-IPv4 `localhost` mismatch that
makes the dev server unreachable in some browsers, and lets you test from a phone on the same
network.

Port 3000 is not arbitrary: it must match `APPS.frontend_url` and `CORS.allowed_origins` in
the backend's `config.yml`, and the Authorized JavaScript Origins on the Google OAuth client.

---

## Configuration

`src/config.js` is **gitignored** — copy it from `config_example.js` on a fresh checkout or
the app won't build. It exports four things:

| Export | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client id, same value as the backend's `GOOGLE.CLIENT_ID`. Leave it `""` to hide the Sign in with Google button entirely |
| `SHOP_INFO` | Name, tagline, subtitle, opening `hours`, `email`, and the primary `location` / `phone` |
| `MAP_EMBED_URL` | Google Maps embed shown in the footer |
| `BRANCHES` | Array of store locations rendered on the Contact page and in the footer |
| `SOCIAL_LINKS` | Twitter / Facebook / Instagram URLs for the footer icons |

`BRANCHES` is the single source for store details. Its first entry reuses
`SHOP_INFO.location` / `.phone` / `MAP_EMBED_URL` rather than copying them, so the footer and
Contact page can't drift apart. Adding a third store is one more object in that array —
the Contact page grows another card and the footer another labelled line, no JSX changes:

```js
{
  name: "Richmond Hill",
  address: "…",
  phone: "(718) 555-0000",
  mapUrl: "https://maps.google.com/maps?q=…&output=embed",
}
```

Keep `config_example.js` in step whenever you add a key, minus the real secrets.

---

## Routes

Defined in `src/main.jsx`.

| Path | Screen | Guard |
|---|---|---|
| `/` | Home | — |
| `/about` | About | — |
| `/shop` | Shop, with category / price / search filters | — |
| `/shop/:id` | ProductDetail | — |
| `/services` | Services + repair estimate form | — |
| `/gallery` | Gallery | — |
| `/contact` | Contact + message form | — |
| `/login` `/register` | Login, Register | — |
| `/forgot-password` `/reset-password` | Password recovery | — |
| `/cart` | Cart | — |
| `/change-password` | ChangePassword | `RequireAuth` |
| `/checkout` | Checkout | `RequireAuth` |
| `/my-orders` | MyOrders | `RequireAuth` |
| `/admin/*` | Admin panel | `RequireAdmin` |
| anything else | Not found | — |

`/admin` redirects to `/admin/products`; the panel's own nested routes are `products`,
`categories`, `orders`, `users`, `gallery` and `activity`.

`RequireAuth` bounces to `/login` carrying the attempted path in router state, so a signed-in
user lands where they were going. `RequireAdmin` sends non-admins to `/`. **Both are UI
convenience only** — they read the role out of the unverified JWT payload in `localStorage`.
Every admin endpoint is enforced server-side; never treat these guards as security.

---

## State

Three providers wrap the app, nested in `main.jsx` as Auth → Cart → Confirm.

**`useAuth()`** — `{ user, login, loginGoogle, register, logout }`. `user` is
`{ username, id, role }`, decoded from the access token rather than fetched, so it survives a
refresh with no extra request. `register` signs the new account in immediately after creating
it.

**`useCart()`** — `{ items, addItem, setQty, removeItem, clear, count, total }`. Persisted to
`localStorage` under `wt_cart` and restored on load, so a cart survives a closed tab. Quantity
is clamped to the product's stock when known. The cart is browser-local and never syncs to
the server; stock is only truly checked when the order is placed.

**`useConfirm()`** — returns `confirm(message)`, a promise resolving to `true` / `false`,
rendering a modal. Every action that writes to the database goes through it — placing an
order, cancelling one, and every create/edit/deactivate in the admin panel. Keep that
convention for new mutating actions:

```jsx
const confirm = useConfirm();
if (!(await confirm(`Deactivate "${product.name}"?`))) return;
```

---

## Talking to the API

Everything goes through `api()` in `src/api.js`.

```js
await api("/api/products?limit=4", { auth: false });          // public GET
await api("/api/orders", { method: "POST", body: {...} });    // JSON body, auth header
await api("/api/gallery", { method: "POST", body: fd, form: true }); // FormData upload
```

- **`body`** is JSON-encoded automatically. With `form: true` it is passed through untouched
  so the browser can set the multipart boundary itself.
- **`auth: false`** omits the `Authorization` header for public endpoints.
- **Token refresh is automatic.** A 401 on an authenticated request triggers one
  `/api/auth/refresh` call; if that succeeds the original request is retried once, and if it
  fails the session is cleared. Callers never handle this.
- **Errors** become a thrown `Error` whose `message` is the backend's `detail` and whose
  `status` carries the code. It unwraps all three shapes the backend produces: a plain string,
  the nested `{detail: {detail}}` from the password validator, and Pydantic's
  `[{msg}]` array. So `catch (e) => setError(e.message)` shows something readable every time.
- **204** returns `null` rather than exploding on an empty body.

Tokens live in `localStorage` as `wt_access` and `wt_refresh`. Also exported: `money(value)`
for `$0.00` formatting, `currentUser()`, `decodeToken()`, `setSession()`, `clearSession()`.

---

## Shared components

All from `src/components.jsx`.

| Export | What it is |
|---|---|
| `Navbar` `Footer` | Site chrome, rendered once in `main.jsx` |
| `Img` | `<img>` with a labelled placeholder box when the file is missing or fails. Lazy-loads by default; pass `priority` for above-the-fold images |
| `ProductCard` | Catalogue tile used by Shop and New Arrivals |
| `NewArrivals` `ServicesShowcase` | Reusable sections on Home and Cart. `plain` swaps the big outlined heading for a simple one |
| `RequireAuth` `RequireAdmin` | Route guards |
| `StatusBadge` `OrderProgress` | Order status pill and the placed → confirmed → delivered stepper |
| `PhoneInput` | Digits-only input auto-formatted `(555) 123-4567`, with a matching `pattern` |
| `PasswordInput` | Password field with a show/hide eye toggle |
| `usePager` `Pager` | Client-side pagination — `usePager(items, perPage)` returns `{slice, page, pages, setPage}` to spread straight into `<Pager />` |
| `SectionHeading` `SocialIcons` | Outlined section title; footer social SVGs |

---

## Styling

One stylesheet, `src/styles.css`, imported once in `main.jsx`. It's organised top to bottom
by area with comment banners (`/* ---------- navbar ---------- */`), ending with the
responsive block.

Colours and radius come from CSS variables on `:root` — `--green` `#76b900` is the brand
colour, with `--green-dark` for text and hover states and `--green-light` for fills. Use the
variables rather than literal hex so a palette change stays in one place.

Two breakpoints: **900px** (grids collapse to one column, nav links wrap to their own row) and
**600px** (phone spacing, smaller logo, tables scroll sideways). Class names are plain and
scoped by area — `.contact-card`, `.branch-map`, `.admin-form`, `.order-items-table`. There is
no CSS module or scoping mechanism, so keep new names prefixed by their area to avoid
collisions.

---

## Static assets

`public/images/` is served at `/images/...` verbatim. Filenames are hardcoded in the
components, so a missing file shows `Img`'s grey placeholder rather than breaking the page —
handy, but easy to miss.

| File | Used by |
|---|---|
| `logo.png` | Navbar, favicon |
| `hero1.jpg` – `hero3.jpg` | Home carousel |
| `cat-phones` / `cat-repairs` / `cat-activation` / `cat-accessories.jpg` | Home category tiles |
| `svc-repair` / `svc-unlock` / `svc-sim` / `svc-bill.jpg` | Services tiles on Home and Cart |
| `banner-accessories.png` `banner-holiday.png` | Home promo banners |
| `about1.jpg` – `about3.jpg` | About page collage |
| `repair.jpg` | Services page |
| `dealer1.png` – `dealer7.png` | Footer dealer logos |

Product and gallery photos are **not** here — those are uploaded through the admin panel,
stored under `backend/uploads/`, and served at `/uploads/...`.

A few files in that folder are unused leftovers: `gallery1 2.jpg`, `gallery2.jpg`,
`gallery4.jpg`, `gallery5.jpg`, `svc-repair1.jpg` and `Wireless-Tech-11-scaled.jpg`. The
gallery became database-driven and these were never removed — they're several MB of dead
weight in the build.

---

## Building for production

```bash
npm run build     # → dist/
```

Nginx serves `dist/` with a `try_files $uri /index.html` fallback so client-side routes work
on refresh, and proxies `/api` and `/uploads` to the backend. `../DEPLOYMENT.md` has the full
server block.

A `package-lock.json` is committed, so use `npm ci` on the server for reproducible installs.

---

## Known gaps

- **`Navbar` fetches `/api/categories` into state it never renders** — leftover from a removed
  dropdown. It's a wasted request on every page load, and the matching `.nav-drop` /
  `.nav-drop-menu` CSS is dead too.
- **Admin lists paginate client-side over a capped fetch** (products 100, orders and users
  200, activity 500). Past those counts, older rows silently disappear from the admin panel.
- **`Shop.jsx` fires duplicate fetches** — its effect lists `categoryId`, `sort` and `page`
  alongside `params`, which all three derive from.
- **Tokens sit in `localStorage`**, readable by any injected script; there's no logout-side
  token revocation.
- **No tests and no linter config.**
- The unused images noted above.
