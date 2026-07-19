import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { PhoneInput, PasswordInput } from "../components";
import { useAuth } from "../context";
import { GOOGLE_CLIENT_ID } from "../config";

function GoogleButton({ onError }) {
  const { loginGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const divRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !divRef.current) return;
    const init = () => {
      if (!window.google?.accounts?.id || !divRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            await loginGoogle(response.credential);
            navigate(location.state?.from || "/", { replace: true });
          } catch (e) {
            onError(e.message);
          }
        },
      });
      window.google.accounts.id.renderButton(divRef.current, {
        theme: "outline",
        size: "large",
        width: 380,
      });
    };
    if (window.google?.accounts?.id) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    }
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={divRef} style={{ marginTop: 16, display: "flex", justifyContent: "center" }} />;
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2>Log in</h2>
      <label>Username</label>
      <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
      <label>Password</label>
      <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button className="btn btn-green" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      {error && <p className="error-msg">{error}</p>}
      <GoogleButton onError={setError} />
      <div className="form-links">
        <Link to="/forgot-password">Forgot password?</Link>
        {" · "}
        <Link to="/register">Create an account</Link>
      </div>
    </form>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    username: "",
    user_email: "",
    phone_number: "",
    user_address: "",
    password: "",
  });
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await register(form);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form form-signup" onSubmit={submit}>
      <h2>Create your account</h2>
      <p className="form-sub">Join Wireless Tech to shop and track your orders.</p>

      <div className="form-grid">
        <div className="field">
          <label>Username *</label>
          <input value={form.username} onChange={set("username")} required />
        </div>
        <div className="field">
          <label>Email *</label>
          <input type="email" value={form.user_email} onChange={set("user_email")} required />
        </div>
        <div className="field">
          <label>Phone</label>
          <PhoneInput
            value={form.phone_number}
            onChange={(v) => setForm({ ...form, phone_number: v })}
          />
        </div>
        <div className="field">
          <label>Address</label>
          <input value={form.user_address} onChange={set("user_address")} />
        </div>
        <div className="field">
          <label>Password *</label>
          <PasswordInput value={form.password} onChange={set("password")} required />
        </div>
        <div className="field">
          <label>Confirm password *</label>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
      </div>

      <p className="form-hint">
        Password must be at least 8 characters with a capital letter, a digit and a special character.
      </p>
      <button className="btn btn-green" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
      {error && <p className="error-msg">{error}</p>}
      <div className="form-links">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </form>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
        auth: false,
      });
      setMsg({ ok: true, text: res.detail });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2>Forgot password</h2>
      <p style={{ fontSize: 14, color: "#666" }}>
        Enter your account email and we'll send you a reset link.
      </p>
      <label>Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <button className="btn btn-green" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      {msg && <p className={msg.ok ? "success-msg" : "error-msg"}>{msg.text}</p>}
      <div className="form-links">
        <Link to="/login">Back to log in</Link>
      </div>
    </form>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setMsg({ ok: false, text: "Passwords do not match" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: { token, new_password: password },
        auth: false,
      });
      setMsg({ ok: true, text: "Password reset! Redirecting to log in…" });
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="form">
        <h2>Reset password</h2>
        <p className="error-msg">Missing reset token — use the link from your email.</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>Reset password</h2>
      <label>New password</label>
      <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
      <label>Confirm new password</label>
      <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <button className="btn btn-green" disabled={busy}>{busy ? "Saving…" : "Reset password"}</button>
      {msg && <p className={msg.ok ? "success-msg" : "error-msg"}>{msg.text}</p>}
    </form>
  );
}

export function ChangePassword() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPw !== confirm) {
      setMsg({ ok: false, text: "Passwords do not match" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api("/api/auth/change-password", {
        method: "PUT",
        body: { old_password: oldPw, new_password: newPw },
      });
      setMsg({ ok: true, text: res.detail });
      setOldPw("");
      setNewPw("");
      setConfirm("");
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2>Change password</h2>
      <label>Current password</label>
      <PasswordInput value={oldPw} onChange={(e) => setOldPw(e.target.value)} required />
      <label>New password</label>
      <PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
      <label>Confirm new password</label>
      <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <button className="btn btn-green" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
      {msg && <p className={msg.ok ? "success-msg" : "error-msg"}>{msg.text}</p>}
    </form>
  );
}
