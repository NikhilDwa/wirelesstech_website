// Small fetch wrapper for the FastAPI backend.
// Handles JSON, auth headers, and automatic access-token refresh on 401.

const ACCESS = "wt_access";
const REFRESH = "wt_refresh";

export function decodeToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload;
  } catch {
    return null;
  }
}

export function currentUser() {
  const token = localStorage.getItem(ACCESS);
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  return { username: payload.sub, id: payload.id, role: payload.role };
}

export function setSession({ access_token, refresh_token }) {
  if (access_token) localStorage.setItem(ACCESS, access_token);
  if (refresh_token) localStorage.setItem(REFRESH, refresh_token);
}

export function clearSession() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

async function tryRefresh() {
  const refresh = localStorage.getItem(REFRESH);
  if (!refresh) return false;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      clearSession();
      return false;
    }
    const data = await res.json();
    setSession(data);
    return true;
  } catch {
    return false;
  }
}

function buildRequest(path, { method = "GET", body, form = false, auth = true } = {}) {
  const headers = {};
  const token = localStorage.getItem(ACCESS);
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = body; // FormData / URLSearchParams: browser sets the content type
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return fetch(path, { method, headers, body: payload });
}

export async function api(path, opts = {}) {
  let res = await buildRequest(path, opts);
  if (res.status === 401 && opts.auth !== false && localStorage.getItem(REFRESH)) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await buildRequest(path, opts);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (data.detail && typeof data.detail.detail === "string") detail = data.detail.detail;
      else if (Array.isArray(data.detail) && data.detail[0]?.msg)
        detail = data.detail[0].msg;
    } catch {
      /* keep default */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- auth calls ----

export async function apiLogin(username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch("/api/auth/token", { method: "POST", body });
  if (!res.ok) {
    let detail = "Login failed";
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    const err = new Error(typeof detail === "string" ? detail : "Login failed");
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  setSession(data);
  return data;
}

export async function apiGoogleLogin(credential) {
  const data = await api("/api/auth/google", {
    method: "POST",
    body: { credential },
    auth: false,
  });
  setSession(data);
  return data;
}

export function productImage(product) {
  if (product && product.image_url) return product.image_url;
  return null;
}

export function money(value) {
  return `$${Number(value).toFixed(2)}`;
}
