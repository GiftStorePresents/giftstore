// src/services/sitemapData.ts
import type { PrismaClient } from "@prisma/client";

type Row = { slug: string; updatedAt?: string | Date | null };

function normApiItems(data: any): any[] {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data)) return data;
  return [];
}

export async function getProductRows(prisma?: PrismaClient, apiBase?: string): Promise<Row[]> {
  const db = prisma as any;
  // Najpierw spróbuj przez Prisma (jeśli model istnieje)
  if (db?.product?.findMany) {
    try {
      const rows = await db.product.findMany({
        select: { slug: true, updatedAt: true }, // bez 'published'
      });
      return rows as Row[];
    } catch {
      // jeśli model/kolumny nie istnieją -> fallback
    }
  }

  // Fallback do API
  if (!apiBase) return [];
  const url = `${apiBase.replace(/\/+$/, "")}/products?limit=1000`;
  const res = await fetch(url);
  const data: any = await res.json();
  const items = normApiItems(data);
  return items.map((p: any) => ({
    slug: String(p.slug),
    updatedAt: p.updatedAt || p.modifiedAt || p.updated_at || null,
  }));
}

export async function getCategoryRows(prisma?: PrismaClient, apiBase?: string): Promise<Row[]> {
  const db = prisma as any;
  if (db?.category?.findMany) {
    try {
      const rows = await db.category.findMany({
        select: { slug: true, updatedAt: true },
      });
      return rows as Row[];
    } catch {}
  }

  if (!apiBase) return [];
  const url = `${apiBase.replace(/\/+$/, "")}/categories`;
  const res = await fetch(url);
  const data: any = await res.json();
  const items = normApiItems(data);
  return items.map((c: any) => ({
    slug: String(c.slug),
    updatedAt: c.updatedAt || c.modifiedAt || c.updated_at || null,
  }));
}

export async function getArticleRows(prisma?: PrismaClient, apiBase?: string): Promise<Row[]> {
  const db = prisma as any;
  if (db?.article?.findMany) {
    try {
      const rows = (await db.article.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      })) as any[];
      return rows.map((a) => ({ slug: String(a.slug), updatedAt: a.updatedAt ?? null }));
    } catch {}
  }

  if (!apiBase) return [];
  const url = `${apiBase.replace(/\/+$/, "")}/api/blog`;
  const res = await fetch(url);
  const data: any = await res.json();
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items.map((a: any) => ({
    slug: String(a.slug),
    updatedAt: a.updatedAt || a.publishedAt || a.modifiedAt || a.updated_at || null,
  }));
}

