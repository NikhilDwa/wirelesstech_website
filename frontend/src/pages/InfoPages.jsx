import { useEffect, useState } from "react";
import { api } from "../api";
import { Img, PhoneInput } from "../components";
import { SHOP_INFO, MAP_EMBED_URL } from "../config";

export function About() {
  return (
    <div className="container">
      <h1>About</h1>
      <div className="about-grid">
        <div>
          <p style={{ lineHeight: 1.8 }}>
            <b>Wireless Tech</b> is one-stop solution for all wireless needs. We are constantly
            working for our customers with a vision to help and provide all Wireless technical
            solutions. Wireless tech has more than ten years of experience in helping its clients.
            Our mission is to provide the customer with our services seven days a week—A quick
            turnaround time to any inquiry and questions directly with our clients.
          </p>
        </div>
        <div className="about-blocks">
          <div className="blk blk-1"><Img src="/images/about1.jpg" alt="About 1" fallback="" /></div>
          <div className="blk blk-2"><Img src="/images/about2.jpg" alt="About 2" fallback="" /></div>
          <div className="blk blk-3"><Img src="/images/about3.jpg" alt="About 3" fallback="" /></div>
        </div>
      </div>
    </div>
  );
}

const PROBLEM_OPTIONS = ["Battery Replacement", "Screen Replacement", "Water Damage", "I don't know"];

export function Services() {
  const [form, setForm] = useState({ brand: "", model: "", name: "", phone: "", email: "" });
  const [problems, setProblems] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleProblem = (p) =>
    setProblems((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api("/api/services/estimate", {
        method: "POST",
        body: { ...form, problems },
        auth: false,
      });
      setMsg({ ok: true, text: res.detail });
      setForm({ brand: "", model: "", name: "", phone: "", email: "" });
      setProblems([]);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <h1>Repair Laptop, Tablet & PC</h1>
      <div className="estimate">
        <form onSubmit={submit}>
          <h4>Get Free Estimate</h4>
          <div className="grid-2">
            <div>
              <label>Brand</label>
              <input value={form.brand} onChange={set("brand")} required />
            </div>
            <div>
              <label>Model</label>
              <input value={form.model} onChange={set("model")} required />
            </div>
          </div>
          <label>Your Problems</label>
          <div className="problems">
            {PROBLEM_OPTIONS.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={problems.includes(p)}
                  onChange={() => toggleProblem(p)}
                />
                {p}
              </label>
            ))}
          </div>
          <label>Name</label>
          <input value={form.name} onChange={set("name")} required />
          <div className="grid-2">
            <div>
              <label>Phone No.</label>
              <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            </div>
            <div>
              <label>Email</label>
              <input type="email" value={form.email} onChange={set("email")} required />
            </div>
          </div>
          <button className="btn btn-green" disabled={busy} style={{ marginTop: 20 }}>
            {busy ? "Sending…" : "Request Estimate"}
          </button>
          {msg && <p className={msg.ok ? "success-msg" : "error-msg"}>{msg.text}</p>}
        </form>
        <div className="estimate-side">
          <div className="quote-box">
            At Wireless Tech our Certified Repair Technician provides 100% satisfaction of the
            Repairs done by Wireless Tech. Fast, Reliable, Secure and Quick Turnaround makes us
            very dependable. Wireless Tech offer warranty for any repairs done by us so feel free
            to Get your devices repair by us.
          </div>
          <Img src="/images/repair.jpg" alt="Repair" fallback="repair photo" />
        </div>
      </div>
    </div>
  );
}

export function Gallery() {
  const [images, setImages] = useState(null);

  useEffect(() => {
    api("/api/gallery", { auth: false })
      .then(setImages)
      .catch(() => setImages([]));
  }, []);

  return (
    <div className="container">
      <h1>Gallery</h1>
      {images && images.length === 0 && (
        <p style={{ color: "#888" }}>No photos yet — check back soon!</p>
      )}
      <div className="gallery-grid">
        {(images || []).map((g) => (
          <figure className="gallery-item" key={g.id}>
            <Img src={g.image_url} alt={g.title || "Gallery photo"} />
            {g.title && <figcaption>{g.title}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  );
}

export function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api("/api/services/contact", { method: "POST", body: form, auth: false });
      setMsg({ ok: true, text: res.detail });
      setForm({ name: "", email: "", phone: "", message: "" });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <h1>Contact</h1>
      <div className="contact-grid">
        <div>
          <div className="contact-cards">
            <div className="contact-card">
              <span className="ico">🕒</span>
              <b>Opening Hours</b>
              {SHOP_INFO.hours.map((h) => <p key={h}>{h}</p>)}
            </div>
            <div className="contact-card">
              <span className="ico">📞</span>
              <b>Phone</b>
              <p>{SHOP_INFO.phone}</p>
            </div>
            <div className="contact-card">
              <span className="ico">✉️</span>
              <b>Email</b>
              <p>{SHOP_INFO.email}</p>
            </div>
            <div className="contact-card">
              <span className="ico">📍</span>
              <b>Location</b>
              <p>{SHOP_INFO.location}</p>
            </div>
          </div>
          <iframe
            className="contact-map"
            src={MAP_EMBED_URL}
            title="Wireless Tech store location"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <form className="form" style={{ margin: 0 }} onSubmit={submit}>
          <h2>Send us a message</h2>
          <label>Name</label>
          <input value={form.name} onChange={set("name")} required />
          <label>Email</label>
          <input type="email" value={form.email} onChange={set("email")} required />
          <label>Phone</label>
          <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <label>Message</label>
          <textarea rows="4" value={form.message} onChange={set("message")} required />
          <button className="btn btn-green" disabled={busy}>
            {busy ? "Sending…" : "Send Message"}
          </button>
          {msg && <p className={msg.ok ? "success-msg" : "error-msg"}>{msg.text}</p>}
        </form>
      </div>
    </div>
  );
}
