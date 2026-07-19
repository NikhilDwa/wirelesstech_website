import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Img, SectionHeading, NewArrivals, ServicesShowcase } from "../components";
import { SHOP_INFO } from "../config";

const HERO_SLIDES = ["/images/hero1.jpg", "/images/hero2.jpg", "/images/hero3.jpg"];

function Carousel() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % HERO_SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="carousel">
      <Img src={HERO_SLIDES[idx]} alt={`Slide ${idx + 1}`} fallback="carousels" priority />
      <button
        className="carousel-btn prev"
        onClick={() => setIdx((idx - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)}
        aria-label="Previous slide"
      >
        ‹
      </button>
      <button
        className="carousel-btn next"
        onClick={() => setIdx((idx + 1) % HERO_SLIDES.length)}
        aria-label="Next slide"
      >
        ›
      </button>
      <div className="carousel-dots">
        {HERO_SLIDES.map((_, i) => (
          <span key={i} className={i === idx ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

const CATEGORY_TILES = [
  { label: "Phones", img: "/images/cat-phones.jpg", to: "/shop" },
  { label: "Repairs", img: "/images/cat-repairs.jpg", to: "/services" },
  { label: "Activation & Payment", img: "/images/cat-activation.jpg", to: "/services" },
  { label: "Accessories", img: "/images/cat-accessories.jpg", to: "/shop" },
];

export default function Home() {
  return (
    <div className="container home">
      {/* hero */}
      <section className="hero">
        <div>
          <h4>WELCOME TO</h4>
          <h1>
            WIRELESS
            <br />
            TECH
          </h1>
          <p className="tagline">
            <b>One Stop Solution</b> for all your needs.
            <br />
            {SHOP_INFO.subtitle}
          </p>
          <Link to="/shop" className="btn btn-green">
            SHOP NOW
          </Link>
        </div>
        <Carousel />
      </section>

      {/* promo banners */}
      <section className="promos">
        <div className="promo promo-dark">
          <div className="promo-body">
            <span className="promo-tag">Bonus</span>
            <b>Free Accessories</b>
            <span>on every bill payment</span>
            <Link to="/services" className="promo-link">Learn more →</Link>
          </div>
          <Img
            src="/images/banner-accessories.png"
            alt="Free accessories"
            className="promo-img"
            fallback="headphones"
          />
        </div>
        <div className="promo promo-green">
          <div className="promo-body">
            <span className="promo-tag">Limited Time</span>
            <b>Up to 20% Off</b>
            <span>on holiday deals</span>
            <Link to="/shop" className="promo-link">Shop now →</Link>
          </div>
          <Img
            src="/images/banner-holiday.png"
            alt="Holiday deals"
            className="promo-img"
            fallback="holiday"
          />
        </div>
      </section>

      {/* category tiles */}
      <section className="tiles">
        {CATEGORY_TILES.map((t) => (
          <Link key={t.label} to={t.to} className="tile">
            <div className="tile-img">
              <Img src={t.img} alt={t.label} fallback={t.label} />
            </div>
            <span>{t.label}</span>
          </Link>
        ))}
      </section>

      <NewArrivals />
      <ServicesShowcase />
    </div>
  );
}
