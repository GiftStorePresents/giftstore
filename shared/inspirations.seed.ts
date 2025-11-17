// shared/inspirations.seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function apiBase() {
  // np. http://localhost:4000
  const fromEnv = process.env.API_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  return `http://localhost:${port}`;
}

function ensureUploadsDir(): string {
  const dir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findLocalSeedFile(filename: string): string | null {
  // wstaw swoje pliki do api/seed_assets/
  const candidates = [
    path.join(process.cwd(), "seed_assets", filename),
    path.join(process.cwd(), "public", filename), // awaryjnie, gdybyś wrzucił do public
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function copyToUploadsIfNeeded(srcPath: string, destDir: string, destName: string) {
  const dest = path.join(destDir, destName);
  if (fs.existsSync(dest)) return; // już jest
  fs.copyFileSync(srcPath, dest);
}

export async function seedInspirations() {
  const base = apiBase();
  const uploadsDir = ensureUploadsDir();

  const rows = [
    {
      slug: "prezent-dla-mamy",
      name: "Prezent dla Mamy",
      description:
        "Wzruszające pomysły na prezent, które sprawią radość każdej mamie.",
      file: "seed_inspiration_mom.jpg",
      position: 1,
      active: true,
    },
    {
      slug: "na-urodziny",
      name: "Na Urodziny",
      description:
        "Zaskocz jubilata wyjątkowym podarunkiem na jego dzień.",
      file: "seed_inspiration_birthday.jpg",
      position: 2,
      active: true,
    },
    {
      slug: "dla-dzieci",
      name: "Dla Dzieci",
      description:
        "Pomysły na prezenty, które zachwycą najmłodszych.",
      file: "seed_inspiration_kids.jpg",
      position: 3,
      active: true,
    },
    {
      slug: "dla-milosnika-kawy",
      name: "Dla Miłośnika Kawy",
      description:
        "Wyjątkowe gadżety i zestawy dla kawoszy.",
      file: "seed_inspiration_coffee.jpg",
      position: 4,
      active: true,
    },
  ];

  for (const row of rows) {
    let imageUrl: string;

    const local = findLocalSeedFile(row.file);
    if (local) {
      // skopiuj do /uploads i buduj absolutny URL do API
      copyToUploadsIfNeeded(local, uploadsDir, row.file);
      imageUrl = `${base}/uploads/${row.file}`;
    } else {
      // brak pliku? daj placeholder (żeby na froncie NIE było 404)
      const label = encodeURIComponent(row.name);
      imageUrl = `https://dummyimage.com/800x600/0b1220/ffd700&text=${label}`;
    }

    await prisma.inspiration.upsert({
      where: { slug: row.slug },
      update: {
        name: row.name,
        description: row.description,
        imageUrl,
        position: row.position,
        active: row.active,
      },
      create: {
        slug: row.slug,
        name: row.name,
        description: row.description,
        imageUrl,
        position: row.position,
        active: row.active,
      },
    });
  }

  console.log("✅ Inspirations seeded");
}

if (require.main === module) {
  seedInspirations()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
