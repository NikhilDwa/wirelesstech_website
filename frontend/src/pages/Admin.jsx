import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { api, money } from "../api";
import { Img, StatusBadge, Pager, usePager, OrderProgress } from "../components";
import { useConfirm } from "../context";

function formatDateTime(value) {
  const d = new Date(value);
  const date = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15V4M12 4L8 8M12 4l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EMPTY_PRODUCT = {
  name: "",
  category_id: "",
  price: "",
  stock: "",
  description: "",
  image_url: "",
};

function AdminProducts() {
  const confirm = useConfirm();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const pager = usePager(products, 10);

  const load = () => {
    api("/api/products?include_inactive=true&limit=100")
      .then((d) => setProducts(d.items))
      .catch((e) => setError(e.message));
    api("/api/categories?include_inactive=true").then(setCategories).catch(() => {});
  };
  useEffect(load, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api("/api/products/upload-image", { method: "POST", body: fd, form: true });
      setForm((f) => ({ ...f, image_url: res.image_url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const ok = await confirm(
      editingId ? `Save changes to product #${editingId}?` : `Add product "${form.name}"?`
    );
    if (!ok) return;
    const body = {
      name: form.name,
      category_id: Number(form.category_id),
      price: Number(form.price),
      stock: Number(form.stock || 0),
      description: form.description,
      image_url: form.image_url,
    };
    try {
      if (editingId) await api(`/api/products/${editingId}`, { method: "PUT", body });
      else await api("/api/products", { method: "POST", body });
      setForm(EMPTY_PRODUCT);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category_id: String(p.category_id || ""),
      price: String(p.price),
      stock: String(p.stock),
      description: p.description || "",
      image_url: p.image_url || "",
    });
    window.scrollTo(0, 0);
  };

  const toggleActive = async (p) => {
    const ok = await confirm(
      p.is_active
        ? `Deactivate "${p.name}"? It will be hidden from the shop (order history is kept).`
        : `Restore "${p.name}" so it shows in the shop again?`
    );
    if (!ok) return;
    try {
      if (p.is_active) await api(`/api/products/${p.id}`, { method: "DELETE" });
      else await api(`/api/products/${p.id}`, { method: "PUT", body: { is_active: true } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="admin-panel">
      <h3>{editingId ? `Edit product #${editingId}` : "Add product"}</h3>
      <form className="admin-form" onSubmit={submit}>
        <div>
          <label>Name *</label>
          <input value={form.name} onChange={set("name")} required />
        </div>
        <div>
          <label>Category *</label>
          <select value={form.category_id} onChange={set("category_id")} required>
            <option value="">Select…</option>
            {categories
              .filter((c) => c.is_active !== false || String(c.id) === String(form.category_id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.is_active === false ? " (deactivated)" : ""}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label>Price *</label>
          <input type="number" step="0.01" min="0" value={form.price} onChange={set("price")} required />
        </div>
        <div>
          <label>Stock</label>
          <input type="number" min="0" value={form.stock} onChange={set("stock")} />
        </div>
        <div className="full">
          <label>Product photo</label>
          <div className="upload-row">
            <label className="upload-btn">
              <input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" onChange={uploadImage} hidden />
              <UploadIcon />
              {uploading ? "Uploading…" : "Choose photo"}
            </label>
            <div className="upload-preview">
              <Img src={form.image_url || null} alt="" className="upload-preview-img" fallback="No photo" />
            </div>
            <input
              className="upload-url"
              value={form.image_url}
              onChange={set("image_url")}
              placeholder="or paste an image URL…"
            />
          </div>
        </div>
        <div className="full">
          <label>Description</label>
          <textarea rows="6" value={form.description} onChange={set("description")} />
        </div>
        <div>
          <button className="btn btn-green">{editingId ? "Save changes" : "Add product"}</button>
        </div>
        {editingId && (
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_PRODUCT);
              }}
            >
              Cancel edit
            </button>
          </div>
        )}
      </form>
      {error && <p className="error-msg">{error}</p>}

      <h3>Products ({products.length})</h3>
      <table className="table">
        <thead>
          <tr>
            <th></th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pager.slice.map((p) => (
            <tr key={p.id} className={p.is_active ? "" : "row-inactive"}>
              <td><Img src={p.image_url || null} alt="" className="admin-thumb" fallback="" /></td>
              <td><b>{p.name}</b></td>
              <td>{p.category}</td>
              <td>{money(p.price)}</td>
              <td>{p.stock}</td>
              <td><StatusBadge status={p.is_active ? "active" : "inactive"} /></td>
              <td>
                <div className="actions-cell">
                  <button className="btn btn-sm" onClick={() => edit(p)}>Edit</button>
                  <button
                    className={`btn btn-sm ${p.is_active ? "btn-danger" : "btn-green"}`}
                    onClick={() => toggleActive(p)}
                  >
                    {p.is_active ? "Deactivate" : "Restore"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager {...pager} />
    </div>
  );
}

function AdminCategories() {
  const confirm = useConfirm();
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const pager = usePager(categories, 10);

  const load = () =>
    api("/api/categories?include_inactive=true").then(setCategories).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const ok = await confirm(
      editingId ? `Rename this category to "${name}"?` : `Add category "${name}"?`
    );
    if (!ok) return;
    try {
      if (editingId) await api(`/api/categories/${editingId}`, { method: "PUT", body: { name } });
      else await api("/api/categories", { method: "POST", body: { name } });
      setName("");
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (c) => {
    setEditingId(c.id);
    setName(c.name);
    window.scrollTo(0, 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
  };

  const remove = async (c) => {
    setError("");
    if (
      !(await confirm(
        `Deactivate category "${c.name}"? It won't be selectable for new or edited products, ` +
          `but products already using it stay visible in the shop.`
      ))
    )
      return;
    try {
      await api(`/api/categories/${c.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const restore = async (c) => {
    setError("");
    if (!(await confirm(`Restore category "${c.name}"?`))) return;
    try {
      await api("/api/categories", { method: "POST", body: { name: c.name } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="admin-panel">
      <h3>{editingId ? "Edit category" : "Add category"}</h3>
      <form className="admin-form" style={{ gridTemplateColumns: "2fr 1fr" }} onSubmit={submit}>
        <div>
          <label>{editingId ? "Category name" : "New category name"}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="actions-cell">
          <button className="btn btn-green">{editingId ? "Save changes" : "Add category"}</button>
          {editingId && (
            <button type="button" className="btn" onClick={cancelEdit}>Cancel edit</button>
          )}
        </div>
      </form>
      {error && <p className="error-msg">{error}</p>}
      <h3>Categories ({categories.length})</h3>
      <table className="table">
        <thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {pager.slice.map((c) => (
            <tr key={c.id} className={c.is_active === false ? "row-inactive" : ""}>
              <td><b>{c.name}</b></td>
              <td><StatusBadge status={c.is_active === false ? "inactive" : "active"} /></td>
              <td>
                <div className="actions-cell">
                  <button className="btn btn-sm" onClick={() => edit(c)}>Edit</button>
                  {c.is_active === false ? (
                    <button className="btn btn-sm btn-green" onClick={() => restore(c)}>Restore</button>
                  ) : (
                    <button className="btn btn-sm btn-danger" onClick={() => remove(c)}>Deactivate</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager {...pager} />
    </div>
  );
}

const STATUSES = ["pending", "confirmed", "delivered", "cancelled"];
const EMPTY_COUNTS = { pending: 0, confirmed: 0, delivered: 0, cancelled: 0, needs_attention: 0 };

function AdminOrders() {
  const confirm = useConfirm();
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "";
  const pager = usePager(orders, 5);

  const loadCounts = () => api("/api/orders/counts").then(setCounts).catch(() => {});

  const load = () => {
    const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    api(`/api/orders${q}`).then(setOrders).catch((e) => setError(e.message));
  };
  useEffect(load, [statusFilter]);
  useEffect(() => {
    loadCounts();
  }, [orders]);

  const setFilter = (value) => {
    if (value) setSearchParams({ status: value });
    else setSearchParams({});
  };

  const FILTERS = [
    { key: "", label: "All" },
    { key: "needs_attention", label: "Needs attention", count: counts.needs_attention },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "confirmed", label: "Confirmed", count: counts.confirmed },
    { key: "delivered", label: "Delivered", count: counts.delivered },
    { key: "cancelled", label: "Cancelled", count: counts.cancelled },
  ];

  const setStatus = async (id, status) => {
    setError("");
    const ok = await confirm(`Set this order to "${status}"?`);
    if (!ok) {
      load(); // restore the select to its real value
      return;
    }
    try {
      await api(`/api/orders/${id}/status`, { method: "PUT", body: { status } });
      load();
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  const itemCount = (o) => o.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="admin-panel">
      <h3>Orders ({orders.length})</h3>
      <div className="status-filter-pills">
        {FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            type="button"
            className={`status-filter-pill ${statusFilter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.count !== undefined && <span className="status-filter-count">{f.count}</span>}
          </button>
        ))}
      </div>
      {error && <p className="error-msg">{error}</p>}
      {orders.length === 0 && (
        <p style={{ color: "var(--muted)", margin: "10px 0" }}>
          No orders {statusFilter ? "match this filter" : "yet"}.
        </p>
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
                })}{" "}
                · user #{o.user_id}
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
              {!["delivered", "cancelled"].includes(o.status) && (
                <div className="status-select-wrap">
                  <label>Update status</label>
                  <select
                    className={`status-select status-select-${o.status}`}
                    value={o.status}
                    onChange={(e) => setStatus(o.id, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </aside>
          </div>
        </article>
      ))}
      <Pager {...pager} />
    </div>
  );
}

function AdminUsers() {
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const pager = usePager(users, 10);

  const load = () => api("/api/account").then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const changeRole = async (u, role) => {
    setError("");
    const ok = await confirm(`Change ${u.username}'s role to "${role}"?`);
    if (!ok) {
      load(); // restore the select
      return;
    }
    try {
      await api(`/api/account/${u.id}`, { method: "PUT", body: { role } });
      load();
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  const restore = async (u) => {
    setError("");
    if (!(await confirm(`Reactivate ${u.username}'s account?`))) return;
    try {
      await api(`/api/account/${u.id}`, { method: "PUT", body: { is_active: true } });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deactivate = async (u) => {
    setError("");
    if (!(await confirm(`Deactivate ${u.username}'s account? They won't be able to log in.`))) return;
    try {
      await api(`/api/account/${u.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="admin-panel">
      <h3>Users ({users.length})</h3>
      {error && <p className="error-msg">{error}</p>}
      <table className="table">
        <thead>
          <tr><th>ID</th><th>Username</th><th>Email</th><th>Provider</th><th>Role</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {pager.slice.map((u) => (
            <tr key={u.id} className={u.is_active ? "" : "row-inactive"}>
              <td>{u.id}</td>
              <td><b>{u.username}</b></td>
              <td>{u.user_email}</td>
              <td>{u.auth_provider}</td>
              <td>
                <div className="role-toggle">
                  {["customer", "admin"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`role-pill role-pill-${r} ${u.role === r ? "active" : ""}`}
                      onClick={() => u.role !== r && changeRole(u, r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </td>
              <td><StatusBadge status={u.is_active ? "active" : "inactive"} /></td>
              <td>
                <div className="actions-cell">
                  {u.is_active ? (
                    <button className="btn btn-sm btn-danger" onClick={() => deactivate(u)}>Deactivate</button>
                  ) : (
                    <button className="btn btn-sm btn-green" onClick={() => restore(u)}>Restore</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager {...pager} />
    </div>
  );
}

function AdminActivity() {
  const [rows, setRows] = useState([]);
  const [actions, setActions] = useState([]);
  const [action, setAction] = useState("");
  const [username, setUsername] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [error, setError] = useState("");
  const pager = usePager(rows, 10);

  // Live search: query the API 0.4s after the admin stops typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUsername(username.trim()), 400);
    return () => clearTimeout(t);
  }, [username]);

  const load = () => {
    const q = new URLSearchParams({ limit: "500" });
    if (action) q.set("action", action);
    if (debouncedUsername) q.set("username", debouncedUsername);
    api(`/api/activities?${q}`).then(setRows).catch((e) => setError(e.message));
  };
  useEffect(load, [action, debouncedUsername]);
  useEffect(() => {
    api("/api/activities/actions").then(setActions).catch(() => {});
  }, []);

  return (
    <div className="admin-panel">
      <h3>Activity log</h3>
      <div className="filters">
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          className="filters-search"
          placeholder="Search by username…"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      {error && <p className="error-msg">{error}</p>}
      <table className="table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>
          {pager.slice.map((a) => (
            <tr key={a.id}>
              <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(a.created_at)}</td>
              <td>{a.user_name}</td>
              <td><span className="badge badge-confirmed">{a.action}</span></td>
              <td>{a.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager {...pager} />
    </div>
  );
}

function AdminGallery() {
  const confirm = useConfirm();
  const [images, setImages] = useState([]);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pager = usePager(images, 12);

  const load = () =>
    api("/api/gallery?include_inactive=true").then(setImages).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const pickFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const upload = async (e) => {
    e.preventDefault();
    const formEl = e.target;
    if (!file) {
      setError("Choose an image file first");
      return;
    }
    if (!(await confirm(`Add "${file.name}" to the gallery?`))) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      await api("/api/gallery", { method: "POST", body: fd, form: true });
      setTitle("");
      setFile(null);
      setPreview(null);
      formEl.reset();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (img) => {
    const label = img.title ? `"${img.title}"` : `photo #${img.id}`;
    const ok = await confirm(
      img.is_active
        ? `Remove ${label} from the gallery? It can be restored later.`
        : `Restore ${label} to the gallery?`
    );
    if (!ok) return;
    setError("");
    try {
      if (img.is_active) await api(`/api/gallery/${img.id}`, { method: "DELETE" });
      else await api(`/api/gallery/${img.id}`, { method: "PUT" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="admin-panel">
      <h3>Add gallery photo</h3>
      <form className="admin-form" onSubmit={upload}>
        <div className="full">
          <label>Photo *</label>
          <div className="upload-row">
            <label className="upload-btn">
              <input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" onChange={pickFile} hidden />
              <UploadIcon />
              {file ? "Change photo" : "Choose photo"}
            </label>
            <div className="upload-preview">
              {preview ? (
                <img src={preview} alt="" className="upload-preview-img" />
              ) : (
                <div className="upload-preview-img img-fallback">No photo</div>
              )}
            </div>
            {file && <span className="upload-filename">{file.name}</span>}
          </div>
        </div>
        <div>
          <label>Title (optional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <button className="btn btn-green" disabled={busy}>
            {busy ? "Uploading…" : "Add photo"}
          </button>
        </div>
      </form>
      {error && <p className="error-msg">{error}</p>}

      <h3>Gallery photos ({images.length})</h3>
      <div className="admin-gallery-grid">
        {pager.slice.map((g) => (
          <div key={g.id} className={`admin-gallery-card ${g.is_active === false ? "inactive" : ""}`}>
            <Img src={g.image_url} alt={g.title || `Photo ${g.id}`} fallback="" />
            <div className="meta">
              <b>{g.title || `Photo #${g.id}`}</b>
              <span style={{ color: "#888" }}>{g.is_active === false ? "hidden" : "visible"}</span>
              <button
                className={`btn btn-sm ${g.is_active === false ? "btn-green" : "btn-danger"}`}
                onClick={() => toggle(g)}
              >
                {g.is_active === false ? "Restore" : "Remove"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <Pager {...pager} />
    </div>
  );
}

export default function Admin() {
  const [needsAttention, setNeedsAttention] = useState(0);

  useEffect(() => {
    const load = () => api("/api/orders/counts").then((c) => setNeedsAttention(c.needs_attention)).catch(() => {});
    load();
    const t = setInterval(load, 30000); // keep the badge fresh while the admin is working
    return () => clearInterval(t);
  }, []);

  return (
    <div className="container">
      <h1>Admin Panel</h1>
      <div className="admin-layout">
        <nav className="admin-nav">
          <NavLink to="/admin/products">Products</NavLink>
          <NavLink to="/admin/categories">Categories</NavLink>
          <NavLink to="/admin/orders?status=needs_attention" className="admin-nav-orders">
            Orders
            {needsAttention > 0 && <span className="nav-badge">{needsAttention}</span>}
          </NavLink>
          <NavLink to="/admin/users">Users</NavLink>
          <NavLink to="/admin/gallery">Gallery</NavLink>
          <NavLink to="/admin/activity">Activity</NavLink>
        </nav>
        <Routes>
          <Route index element={<Navigate to="products" replace />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="gallery" element={<AdminGallery />} />
          <Route path="activity" element={<AdminActivity />} />
        </Routes>
      </div>
    </div>
  );
}
