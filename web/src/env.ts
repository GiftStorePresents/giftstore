// src/env.ts
export const env = {
  API_URL:
    import.meta.env.VITE_API_URL ??
    "http://localhost:4000",

  SITE_URL:
    import.meta.env.VITE_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"),

  GA_ID: import.meta.env.VITE_GA_MEASUREMENT_ID ?? null,
};
