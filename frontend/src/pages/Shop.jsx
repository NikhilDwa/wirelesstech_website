import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, money } from "../api";
import { Img, ProductCard } from "../components";
import { useCart } from "../context";

const PAGE_SIZE = 12;

export function Shop() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState(params.get("search") || "");
  const [error, setError] = useState("");

  const categoryId = params.get("category_id") || "";
  const sort = params.get("sort") || "recent";
  const page = Number(params.get("page") || 0);

  useEffect(() => {
    api("/api/categories", { auth: false }).then(setCategories).catch(() => {});
  }, []);

  // Live search: query the API 0.4s after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => {
      const current = params.get("search") || "";
      if (search.trim() !== current) update("search", search.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const q = new URLSearchParams({ sort, skip: String(page * PAGE_SIZE), limit: String(PAGE_SIZE) });
    if (categoryId) q.set("category_id", categoryId);
    const searchTerm = params.get("search");
    if (searchTerm) q.set("search", searchTerm);
    api(`/api/products?${q}`, { auth: false })
      .then((data) => {
        setProducts(data.items);
        setTotal(data.total);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [categoryId, sort, page, params]);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="container">
      <h1>PRODUCTS</h1>
      <div className="shop-layout">
        <aside className="sidebar">
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              update("search", search.trim());
            }}
          >
            <span>🔍</span>
            <input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <div className="panel">
            <h5>Categories</h5>
            <span
              className={`cat-item ${!categoryId ? "on" : ""}`}
              onClick={() => update("category_id", "")}
            >
              All
            </span>
            {categories.map((c) => (
              <span
                key={c.id}
                className={`cat-item ${String(c.id) === categoryId ? "on" : ""}`}
                onClick={() => update("category_id", String(c.id))}
              >
                {c.name}
              </span>
            ))}
          </div>
        </aside>

        <div>
          <div className="shop-toolbar">
            <span>Sort By ⇅</span>
            <select value={sort} onChange={(e) => update("sort", e.target.value)}>
              <option value="recent">Date</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
            {products.length === 0 && !error && (
              <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "#888" }}>
                No products found.
              </p>
            )}
          </div>
          {pages > 1 && (
            <div className="pager">
              <button
                className="btn btn-sm"
                disabled={page === 0}
                onClick={() => update("page", String(page - 1))}
              >
                ‹ Prev
              </button>
              <span>
                Page {page + 1} of {pages}
              </span>
              <button
                className="btn btn-sm"
                disabled={page + 1 >= pages}
                onClick={() => update("page", String(page + 1))}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Renders "Label: value" description lines as an aligned spec table;
// plain lines fall back to normal paragraphs.
function DescriptionSpecs({ text }) {
  if (!text) return <p className="desc">No description yet.</p>;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="desc">
      {lines.map((line, i) => {
        const m = line.match(/^([^:]{1,40}):\s*(.+)$/);
        if (m) {
          return (
            <div className="spec-row" key={i}>
              <span className="spec-label">{m[1]}</span>
              <span className="spec-value">{m[2]}</span>
            </div>
          );
        }
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api(`/api/products/${id}`)
      .then((p) => {
        setProduct(p);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="container">
        <p className="error-msg">{error}</p>
      </div>
    );
  }
  if (!product) return <div className="container"><p>Loading…</p></div>;

  const outOfStock = product.stock <= 0;

  const buyNow = () => {
    addItem(product, qty);
    navigate("/cart");
  };

  return (
    <div className="container">
      <h1>{product.name}</h1>
      <div className="detail">
        <div className="detail-img">
          <Img src={product.image_url || null} alt={product.name} fallback={product.name} />
        </div>
        <div className="detail-info">
          <h2>{product.name}</h2>
          <p className="cats">Categories: {product.category || "—"}</p>
          <p className="product-price" style={{ fontSize: 22 }}>{money(product.price)}</p>
          <p className="stock-note">
            {outOfStock ? "Out of stock" : `${product.stock} in stock`}
          </p>
          <div className="qty-row">
            <label htmlFor="qty">Qty</label>
            <input
              id="qty"
              type="number"
              min="1"
              max={product.stock}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-green" disabled={outOfStock} onClick={buyNow}>
              BUY NOW
            </button>
            <button
              className="btn btn-dark"
              disabled={outOfStock}
              onClick={() => {
                addItem(product, qty);
                setAdded(true);
                setTimeout(() => setAdded(false), 1500);
              }}
            >
              {added ? "Added ✓" : "Add to Cart"}
            </button>
          </div>
          <DescriptionSpecs text={product.description} />
        </div>
      </div>
    </div>
  );
}
