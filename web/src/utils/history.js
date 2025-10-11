// src/utils/history.js
const KEY = "gs_viewed";

export function addViewed(p) {
  try {
    if (!p || !p.slug) return;
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    const next = [p.slug, ...arr.filter((x) => x !== p.slug)].slice(0, 30);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function getViewed() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
