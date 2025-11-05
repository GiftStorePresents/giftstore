export type CategoryLite = { id: string; name: string; slug: string; productsCount?: number };

export async function fetchCategories(params?: { onlyWithProducts?: boolean; q?: string }) {
  const url = new URL("/api/products/categories", window.location.origin);
  url.searchParams.set("withCount", "true");
  if (params?.onlyWithProducts) url.searchParams.set("onlyWithProducts", "true");
  if (params?.q) url.searchParams.set("q", params.q);

  const r = await fetch(url.toString(), { credentials: "include" });
  if (!r.ok) throw new Error("Categories fetch failed");
  const j = await r.json();
  return (j.items || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    productsCount: c._count?.products ?? undefined,
  })) as CategoryLite[];
}
