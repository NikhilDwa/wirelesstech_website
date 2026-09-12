import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import { api, money } from "./api";
import { useAuth, useCart } from "./context";
import { SHOP_INFO, MAP_EMBED_URL, SOCIAL_LINKS, BRANCHES } from "./config";

// Service tiles shown on the home page and cart page
const SERVICE_TILES = [
  { label: "Repair Laptops, Tablet & PC", img: "/images/svc-repair.jpg" },
  { label: "Phone Unlocking", img: "/images/svc-unlock.jpg" },
  { label: "Sim Card Activation", img: "/images/svc-sim.jpg" },
  { label: "Bill Payment", img: "/images/svc-bill.jpg" },
];

// Heading that's either the big outlined style (home) or a clean plain style
function ShowcaseHeading({ label, plain }) {
  if (plain) return <h2 className="section-title-plain">{label}</h2>;
  return <SectionHeading outline="CHECK OUR" label={label} />;
}

// Reusable "New Arrivals" grid (fetches the 4 newest products)
export function NewArrivals({ plain }) {
  const [arrivals, setArrivals] = useState([]);
  useEffect(() => {
    api("/api/products?limit=4&sort=recent", { auth: false })
      .then((data) => setArrivals(data.items))
      .catch(() => setArrivals([]));
  }, []);
  if (arrivals.length === 0) return null;
  return (
    <>
      <ShowcaseHeading label="New Arrivals" plain={plain} />
      <section className="product-grid arrivals-grid">
        {arrivals.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </section>
    </>
  );
}

// Reusable "Services" tile row
export function ServicesShowcase({ plain }) {
  return (
    <>
      <ShowcaseHeading label="Services" plain={plain} />
      <section className="tiles">
        {SERVICE_TILES.map((t) => (
          <Link key={t.label} to="/services" className="tile">
            <div className="tile-img">
              <Img src={t.img} alt={t.label} fallback={t.label} />
            </div>
            <span>{t.label}</span>
          </Link>
        ))}
      </section>
    </>
  );
}

// Social icons (SVG so they always render without image files)
const SOCIAL_ICONS = {
  facebook: (
    <path d="M13.5 9H15V6.5h-1.5c-1.7 0-2.5 1-2.5 2.6V11H9v2.5h2v6h2.5v-6h1.8l.2-2.5h-2v-1.3c0-.5.2-.7.7-.7z" />
  ),
  instagram: (
    <path d="M12 7.2A4.8 4.8 0 1 0 16.8 12 4.81 4.81 0 0 0 12 7.2zm0 7.9A3.1 3.1 0 1 1 15.1 12 3.1 3.1 0 0 1 12 15.1zM17 5.9a1.12 1.12 0 1 0 1.12 1.12A1.12 1.12 0 0 0 17 5.9zM20.4 7a5.9 5.9 0 0 0-.4-1.9 3.9 3.9 0 0 0-2.2-2.2 5.9 5.9 0 0 0-1.9-.4C15 2.4 14.7 2.4 12 2.4s-3 0-4 .1a5.9 5.9 0 0 0-1.9.4A3.9 3.9 0 0 0 3.9 5.1 5.9 5.9 0 0 0 3.5 7c-.1 1-.1 1.3-.1 4s0 3 .1 4a5.9 5.9 0 0 0 .4 1.9 3.9 3.9 0 0 0 2.2 2.2 5.9 5.9 0 0 0 1.9.4c1 .1 1.3.1 4 .1s3 0 4-.1a5.9 5.9 0 0 0 1.9-.4 3.9 3.9 0 0 0 2.2-2.2 5.9 5.9 0 0 0 .4-1.9c.1-1 .1-1.3.1-4s0-3-.1-4zm-1.9 8a3.1 3.1 0 0 1-1.7 1.7 8.2 8.2 0 0 1-2.7.4h-3.9a8.2 8.2 0 0 1-2.7-.4A3.1 3.1 0 0 1 4.9 17a8.2 8.2 0 0 1-.4-2.7v-3.9a8.2 8.2 0 0 1 .4-2.7 3.1 3.1 0 0 1 1.7-1.7 8.2 8.2 0 0 1 2.7-.4h3.9a8.2 8.2 0 0 1 2.7.4 3.1 3.1 0 0 1 1.7 1.7 8.2 8.2 0 0 1 .4 2.7v3.9a8.2 8.2 0 0 1-.4 2.7z" />
  ),
  twitter: (
    <path d="M22 5.9c-.7.3-1.5.5-2.3.6a4 4 0 0 0 1.8-2.2 8 8 0 0 1-2.5 1 4 4 0 0 0-6.9 3.6A11.3 11.3 0 0 1 3.9 4.6a4 4 0 0 0 1.2 5.3 4 4 0 0 1-1.8-.5v.05a4 4 0 0 0 3.2 3.9 4 4 0 0 1-1.8.07 4 4 0 0 0 3.7 2.8A8 8 0 0 1 2 17.9a11.3 11.3 0 0 0 6.1 1.8c7.3 0 11.3-6.1 11.3-11.3v-.5A8 8 0 0 0 22 5.9z" />
  ),
};

export function SocialIcons({ className }) {
  const order = ["twitter", "facebook", "instagram"];
  return (
    <div className={`social-icons ${className || ""}`}>
      {order.map((name) => (
        <a
          key={name}
          href={SOCIAL_LINKS[name]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={name}
          className="social-icon"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            {SOCIAL_ICONS[name]}
          </svg>
        </a>
      ))}
    </div>
  );
}

// Image with graceful fallback (shows a placeholder box until you upload the file).
// Lazy-loads + decodes off the main thread by default so scrolling stays smooth on
// pages with lots of images (shop grid, gallery, admin tables). Pass `priority` for
// the few above-the-fold images (logo, hero) that should load immediately instead.
export function Img({ src, alt, className, fallback, priority }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <div className={`img-fallback ${className || ""}`}>{fallback || alt || "image"}</div>;
  }
  return (
    <img
      src={src}
      alt={alt || ""}
      className={className}
      onError={() => setFailed(true)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

// Shopping cart glyph for the navbar (stroke-based so it inherits the link colour)
function CartIcon() {
  return (
    <svg
      className="cart-icon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 3h2l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.3L20 7H5.2" />
      <circle cx="9.5" cy="19.5" r="1.4" />
      <circle cx="16.5" cy="19.5" r="1.4" />
    </svg>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const [categories, setCategories] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api("/api/categories", { auth: false })
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  return (
    <header className="navbar">
      <Link to="/" className="nav-logo">
        <Img src="/images/logo.png" alt="Wireless Tech" className="nav-logo-img" fallback="WIRELESS TECH" priority />
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end>HOME</NavLink>
        <NavLink to="/about">ABOUT</NavLink>
        <NavLink to="/shop">SHOP</NavLink>
        <NavLink to="/services">SERVICES</NavLink>
        <NavLink to="/gallery">GALLERY</NavLink>
        <NavLink to="/contact">CONTACT</NavLink>
      </nav>
      <div className="nav-actions">
        <Link
          to="/cart"
          className="cart-link"
          aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
        >
          <CartIcon />
          {count > 0 && <span className="cart-badge">{count}</span>}
        </Link>
        {!user ? (
          <>
            <Link to="/login" className="btn btn-ghost">Log in</Link>
            <Link to="/register" className="btn btn-green">Sign up</Link>
          </>
        ) : (
          <div className="nav-user">
            <button className="nav-user-btn" onClick={() => setMenuOpen(!menuOpen)}>
              <span className="nav-avatar" aria-hidden="true">
                {(user.username || "?").charAt(0).toUpperCase()}
              </span>
              <span className="nav-user-name">{user.username}</span>
              <span className={`nav-caret ${menuOpen ? "open" : ""}`} aria-hidden="true">▾</span>
            </button>
            {menuOpen && (
              <div className="nav-user-menu" onClick={() => setMenuOpen(false)}>
                <Link to="/my-orders">My Orders</Link>
                <Link to="/change-password">Change password</Link>
                {user.role === "admin" && <Link to="/admin">Admin panel</Link>}
                <button onClick={logout}>Log out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <h4>Get In Touch</h4>
          <ul className="footer-contact">
            <li>
              <span className="fc-ico">🕒</span>
              <span>
                {SHOP_INFO.hours.map((h) => (
                  <span key={h} className="fc-line">{h}</span>
                ))}
              </span>
            </li>
            <li>
              <span className="fc-ico">📞</span>
              <span>
                {BRANCHES.map((b) => (
                  <span key={b.name} className="fc-line fc-line-branch">
                    <span className="fc-branch">{b.name}</span>
                    <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>{b.phone}</a>
                  </span>
                ))}
              </span>
            </li>
            <li>
              <span className="fc-ico">✉️</span>
              <a href={`mailto:${SHOP_INFO.email}`}>{SHOP_INFO.email}</a>
            </li>
            <li>
              <span className="fc-ico">📍</span>
              <span>
                {BRANCHES.map((b) => (
                  <span key={b.name} className="fc-line fc-line-branch">
                    <span className="fc-branch">{b.name}</span>
                    <span>{b.address}</span>
                  </span>
                ))}
              </span>
            </li>
          </ul>
        </div>
        <div>
          <h4>Authorized Dealers</h4>
          <div className="dealers-grid">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Img key={n} src={`/images/dealer${n}.png`} alt={`Dealer ${n}`} fallback={`d${n}`} />
            ))}
          </div>
        </div>
        <div>
          <h4>Map</h4>
          <iframe
            className="footer-map"
            src={MAP_EMBED_URL}
            title="Wireless Tech store location"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
      <div className="footer-bottom">
        <SocialIcons />
        <p className="footer-copy">© {new Date().getFullYear()} {SHOP_INFO.name}. All rights reserved.</p>
      </div>
    </footer>
  );
}

export function ProductCard({ product }) {
  return (
    <div className="product-card">
      <Link to={`/shop/${product.id}`} className="product-card-img">
        <Img src={product.image_url || null} alt={product.name} fallback={product.name} />
      </Link>
      <div className="product-card-bar">
        <div>
          <span className="product-price">{money(product.price)}</span>
          <span className="product-name">{product.name}</span>
        </div>
        <div className="product-card-side">
          <span className="product-cat">{product.category || ""}</span>
          <Link to={`/shop/${product.id}`} className="read-more">Read More ›</Link>
        </div>
      </div>
    </div>
  );
}

export function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

export function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" state={{ from: "/admin" }} replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

export function SectionHeading({ outline, label }) {
  return (
    <div className="section-heading">
      <span className="outline-text">{outline}</span>
      <h2>{label}</h2>
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export const ORDER_STEPS = [
  { key: "pending", label: "Order placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "delivered", label: "Delivered" },
];

export function OrderProgress({ status }) {
  if (status === "cancelled") {
    return <p className="order-progress-cancelled">This order was cancelled.</p>;
  }
  const current = ORDER_STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="order-progress">
      {ORDER_STEPS.map((s, i) => (
        <li key={s.key} className={i <= current ? "done" : ""}>
          <span className="dot" />
          <span className="step-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

// Phone input: digits only, auto-formatted as (XXX) XXX-XXXX, exactly 10 digits
export function formatPhone(value) {
  const d = String(value).replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function PhoneInput({ value, onChange, required, className, style }) {
  return (
    <input
      type="tel"
      inputMode="numeric"
      placeholder="(555) 123-4567"
      value={value}
      required={required}
      className={className}
      style={style}
      pattern="\(\d{3}\) \d{3}-\d{4}"
      title="Enter a 10-digit phone number: (555) 123-4567"
      onChange={(e) => onChange(formatPhone(e.target.value))}
    />
  );
}

// Password input with a show/hide eye toggle
export function PasswordInput({ value, onChange, required, autoFocus, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

// Client-side pagination for tables and lists
export function usePager(items, pageSize = 10) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = items.slice(current * pageSize, (current + 1) * pageSize);
  return { slice, page: current, pages, setPage };
}

export function Pager({ page, pages, setPage }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
        ‹ Prev
      </button>
      <span>
        Page {page + 1} of {pages}
      </span>
      <button className="btn btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
        Next ›
      </button>
    </div>
  );
}
