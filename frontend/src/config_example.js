// Google OAuth client ID (same one as in backend/config/config.yml).
// Leave empty to hide the "Sign in with Google" button.
export const GOOGLE_CLIENT_ID =
  "";

export const SHOP_INFO = {
  name: "Wireless Tech",
  tagline: "One Stop Solution for all your needs.",
  subtitle: "Cellphones-Accessories-Repairs-Bill payment-Simcard",
  hours: ["Mon - Sat : 9AM - 8PM", "Sun : 10AM - 8PM"],
  email: "wtechny@gmail.com",
  location: "160-11 Hillside Ave, Jamaica, NY, 11432",
  phone: "(718) 526-0251",
};

// Live map shown in the footer (from https://maps.app.goo.gl/upmHWRB73jWVsTX19)
export const MAP_EMBED_URL =
  "https://maps.google.com/maps?q=40.7082865,-73.8015057&z=16&output=embed";

// Store locations shown on the Contact page — one card per branch.
// The first one reuses the SHOP_INFO values so the footer and the contact page
// never drift apart. Add another entry here to show a third store.
export const BRANCHES = [
  {
    name: "Jamaica",
    address: SHOP_INFO.location,
    phone: SHOP_INFO.phone,
    mapUrl: MAP_EMBED_URL,
  },
  {
    name: "Woodhaven",
    address: "80-11A Jamaica Ave, Woodhaven, NY, 11421",
    phone: "(347) 233-4587",
    mapUrl:
      "https://maps.google.com/maps?q=80-11A+Jamaica+Ave,+Woodhaven,+NY+11421&z=16&output=embed",
  },
];

// Social profiles linked from the footer icons — replace with your real pages
export const SOCIAL_LINKS = {
  twitter: "https://twitter.com/",
  facebook: "https://facebook.com/",
  instagram: "https://instagram.com/",
};
