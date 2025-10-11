// scripts/import-blog.ts
import { prisma } from "../src/lib/prisma";
import { BLOG_FAKE, type BlogItem } from "../src/data/blog";

function toDate(iso?: string | null) {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type UpsertAction = "created" | "updated";

async function upsertFromItem(item: BlogItem, opts: { publish: boolean }) {
  const slug = String(item.slug || "").trim();
  if (!slug) return null;

  const publishedAt = toDate(item.publishedAt) ?? new Date();
  const data = {
    title: item.title || "Artykuł",
    slug,
    excerpt: item.excerpt ?? item.description ?? "",
    content: item.content ?? "",
    image: item.image ?? null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    published: opts.publish,
    publishedAt: opts.publish ? publishedAt : null,
  };

  const exists = await prisma.article.findFirst({ where: { slug }, select: { id: true } });

  if (exists) {
    await prisma.article.update({ where: { id: exists.id }, data });
    return { action: "updated" as UpsertAction, slug, id: exists.id };
  } else {
    const created = await prisma.article.create({
      data: { ...data, createdAt: publishedAt },
      select: { id: true },
    });
    return { action: "created" as UpsertAction, slug, id: created.id };
  }
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const has = (k: string) => args.includes(k);
  const val = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    clear: has("--clear"),
    dry: has("--dry"),
    only: val("--only"),
    publish: !has("--draft"), // domyślnie publikujemy; --draft => import jako szkice
  };
}

async function main() {
  const { clear, dry, only, publish } = parseArgs(process.argv);
  console.log(
    `[import-blog] options: clear=${clear} dry=${dry} only=${only ?? "-"} publish=${publish}`
  );

  if (clear) {
    if (dry) {
      const count = await prisma.article.count();
      console.log(`[dry] would delete ${count} existing articles`);
    } else {
      const del = await prisma.article.deleteMany({});
      console.log(`deleted ${del.count} existing articles`);
    }
  }

  const source: BlogItem[] = Array.isArray(BLOG_FAKE) ? BLOG_FAKE : [];
  const items = only ? source.filter((i) => String(i.slug) === String(only)) : source;

  if (items.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  let created = 0;
  let updated = 0;

  for (const it of items) {
    const slug = String(it.slug || "").trim();
    if (!slug) {
      console.warn("skip item without slug:", it.title);
      continue;
    }

    if (dry) {
      const exists = await prisma.article.findFirst({ where: { slug }, select: { id: true } });
      if (exists) {
        console.log(`[dry] would update: ${slug} (id=${exists.id})`);
        updated++;
      } else {
        console.log(`[dry] would create: ${slug}`);
        created++;
      }
    } else {
      const res = await upsertFromItem(it, { publish });
      if (!res) continue;
      console.log(`${res.action}: ${res.slug} (id=${res.id})`);
      if (res.action === "created") created++;
      else updated++;
    }
  }

  console.log(`\nDONE. created=${created}, updated=${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
