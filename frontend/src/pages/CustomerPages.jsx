import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, money } from "../api";
import {
  Img,
  StatusBadge,
  Pager,
  usePager,
  PhoneInput,
  NewArrivals,
  ServicesShowcase,
  OrderProgress,
} from "../components";
import { useAuth, useCart, useConfirm } from "../context";

export function Cart() {
  const { items, setQty, removeItem, total } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const checkout = () => {
    if (!user) navigate("/login", { state: { from: "/checkout" } });
    else navigate("/checkout");
  };

  return (
    <div className="container">
      <h1>Cart</h1>
      {items.length === 0 ? (
        <div className="cart-empty">
          <p>Your cart is empty.</p>
          <Link to="/shop" className="btn btn-green">Browse products</Link>
        </div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Product</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Img src={i.image_url || null} alt={i.name} className="cart-thumb" fallback="" />
                  </td>
                  <td>
                    <Link to={`/shop/${i.id}`}><b>{i.name}</b></Link>
                  </td>
                  <td>{money(i.price)}</td>
                  <td>
                    <span className="qty-btns">
                      <button onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                      {i.qty}
                      <button onClick={() => setQty(i.id, Math.min(i.qty + 1, i.stock || 99))}>+</button>
                    </span>
                  </td>
                  <td>{money(i.qty * i.price)}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => removeItem(i.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cart-total-bar">
            <b>Total: {money(total)}</b>
            <button className="btn btn-green" onClick={checkout}>
              {user ? "Checkout" : "Log in to checkout"}
            </button>
          </div>
        </>
      )}

      <NewArrivals plain />
      <ServicesShowcase plain />
    </div>
  );
}

export function Checkout() {
  const { items, total, clear } = useCart();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);

  if (placed) {
    return (
      <div className="container">
        <div className="form" style={{ textAlign: "center" }}>
          <h2>Order placed! 🎉</h2>
          <p>
            Your order <b>{placed.order_number}</b> for <b>{money(placed.total)}</b> was received.
            <br />
            Payment: cash on delivery. A confirmation email is on its way.
          </p>
          <Link to="/my-orders" className="btn btn-green">View my orders</Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container">
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <Link to="/shop" className="btn btn-green">Browse products</Link>
      </div>
    );
  }

  const placeOrder = async (e) => {
    e.preventDefault();
    const ok = await confirm(`Place this order for ${money(total)} (cash on delivery)?`);
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const order = await api("/api/orders", {
        method: "POST",
        body: {
          shipping_address: address,
          phone,
          items: items.map((i) => ({ product_id: i.id, quantity: i.qty })),
        },
      });
      clear();
      setPlaced(order);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <h1>Checkout</h1>
      <div className="about-grid" style={{ paddingTop: 0 }}>
        <form className="form" style={{ margin: 0 }} onSubmit={placeOrder}>
          <h2>Delivery details</h2>
          <label>Shipping address *</label>
          <textarea rows="3" value={address} onChange={(e) => setAddress(e.target.value)} required />
          <label>Phone</label>
          <PhoneInput value={phone} onChange={setPhone} />
          <p style={{ fontSize: 13, color: "#666", marginTop: 10 }}>
            Payment method: <b>Cash on delivery</b>
          </p>
          <button className="btn btn-green" disabled={busy}>
            {busy ? "Placing order…" : `Place order — ${money(total)}`}
          </button>
          {error && <p className="error-msg">{error}</p>}
        </form>
        <div>
          <h3>Order summary</h3>
          <table className="table">
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.name} × {i.qty}</td>
                  <td style={{ textAlign: "right" }}>{money(i.qty * i.price)}</td>
                </tr>
              ))}
              <tr>
                <td><b>Total</b></td>
                <td style={{ textAlign: "right" }}><b>{money(total)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function MyOrders() {
  const confirm = useConfirm();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const pager = usePager(orders || [], 5);

  const load = () => {
    api("/api/orders/my")
      .then(setOrders)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const cancel = async (o) => {
    if (!(await confirm(`Cancel order ${o.order_number}? The items go back into stock.`))) return;
    try {
      await api(`/api/orders/${o.id}/cancel`, { method: "PUT" });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const itemCount = (o) => o.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="container">
      <div className="orders-header">
        <h1>My Orders</h1>
        {orders && orders.length > 0 && (
          <span className="orders-count">
            {orders.length} order{orders.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {error && <p className="error-msg">{error}</p>}
      {orders && orders.length === 0 && (
        <div className="cart-empty">
          <p>You haven't placed any orders yet.</p>
          <Link to="/shop" className="btn btn-green">Start shopping</Link>
        </div>
      )}

      {pager.slice.map((o) => (
        <article className="order-card" key={o.id}>
          <header className="order-head">
            <div>
              <span className="order-eyebrow">Order number</span>
              <h3 className="order-no">{o.order_number}</h3>
              <span className="order-date">
                Placed on{" "}
                {new Date(o.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}{" "}
                at{" "}
                {new Date(o.created_at).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="order-head-right">
              <StatusBadge status={o.status} />
              <span className="order-amount">{money(o.total)}</span>
            </div>
          </header>

          <OrderProgress status={o.status} />

          <div className="order-body">
            <div className="order-items-box">
              <h4>
                Items <span>({itemCount(o)})</span>
              </h4>
              <table className="order-items-table">
                <tbody>
                  {o.items.map((it) => (
                    <tr key={it.id}>
                      <td className="oi-img">
                        <Img src={it.image_url || null} alt={it.product_name} className="oi-thumb" fallback="" />
                      </td>
                      <td className="oi-name">{it.product_name}</td>
                      <td className="oi-qty">× {it.quantity}</td>
                      <td className="oi-unit">{money(it.unit_price)}</td>
                      <td className="oi-sub">{money(it.unit_price * it.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="order-side">
              <div className="os-block">
                <b>Delivery address</b>
                <p>{o.shipping_address}</p>
              </div>
              {o.phone && (
                <div className="os-block">
                  <b>Phone</b>
                  <p>{o.phone}</p>
                </div>
              )}
              <div className="os-block">
                <b>Payment method</b>
                <p>Cash on delivery</p>
              </div>
              <div className="os-total">
                <span>Order total</span>
                <span>{money(o.total)}</span>
              </div>
              {o.status === "pending" && (
                <button className="btn btn-sm btn-danger" onClick={() => cancel(o)}>
                  Cancel order
                </button>
              )}
            </aside>
          </div>
        </article>
      ))}
      <Pager {...pager} />
    </div>
  );
}
