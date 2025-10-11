// src/utils/analytics.js
let isLoaded = false;

export function initAnalytics() {
  const id = process.env.REACT_APP_GA_ID;
  if (!id || isLoaded) return;

  // dataLayer + gtag stub
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // wstrzyknięcie gtag.js
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);

  // konfiguracja
  gtag("js", new Date());
  // page_view będziemy wysyłać ręcznie z routera
  gtag("config", id, { send_page_view: false });

  isLoaded = true;
}

export function trackPageView({ path, title }) {
  const id = process.env.REACT_APP_GA_ID;
  if (!window.gtag || !id) return;
  window.gtag("event", "page_view", {
    page_title: title || document.title,
    page_path: path || window.location.pathname,
    page_location: window.location.href,
  });
}

export function trackEvent(name, params = {}) {
  if (!window.gtag) return;
  window.gtag("event", name, params);
}
