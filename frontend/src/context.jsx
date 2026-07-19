import { createContext, useContext, useEffect, useState } from "react";
import { api, apiLogin, apiGoogleLogin, clearSession, currentUser } from "./api";

// ---------- Auth ----------

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(currentUser());

  const login = async (username, password) => {
    await apiLogin(username, password);
    setUser(currentUser());
  };

  const loginGoogle = async (credential) => {
    await apiGoogleLogin(credential);
    setUser(currentUser());
  };

  const register = async (form) => {
    await api("/api/auth/register", { method: "POST", body: form, auth: false });
    await apiLogin(form.username, form.password);
    setUser(currentUser());
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, login, loginGoogle, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}

// ---------- Cart ----------

const CartCtx = createContext(null);
const CART_KEY = "wt_cart";

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart());

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: Math.min(i.qty + qty, product.stock || 99) } : i
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image_url: product.image_url,
          stock: product.stock,
          qty,
        },
      ];
    });
  };

  const setQty = (id, qty) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i))
    );

  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
  const clear = () => setItems([]);

  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.reduce((n, i) => n + i.qty * Number(i.price), 0);

  return (
    <CartCtx.Provider value={{ items, addItem, setQty, removeItem, clear, count, total }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  return useContext(CartCtx);
}

// ---------- Confirmation modal ----------
// Any action that changes the database asks the user first via this modal.

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, resolve }

  const confirm = (message) =>
    new Promise((resolve) => {
      setState({ message, resolve });
    });

  const close = (answer) => {
    if (state) state.resolve(answer);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-backdrop" onClick={() => close(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Please confirm</h3>
            <p>{state.message}</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => close(false)}>Cancel</button>
              <button className="btn btn-green" onClick={() => close(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx);
}
