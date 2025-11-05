// api/src/routes/adminProductMedia.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/roles";
import { logAdminAction } from "../lib/adminLog";
import { requireCsrf } from "../middleware/csrf";

export const adminProductMedia: Router = Router();

/* ================================================================================================
   Katalog uploadów (spójny z server.ts → express.static)
================================================================================================ */
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

/* ================================================================================================
   Multer: storage + bezpieczna nazwa pliku
================================================================================================ */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const rawExt = path.extname(file.originalname || "") || "";
    // normalizuj rozszerzenie (np. .JPG -> .jpg)
    const ext = rawExt.toLowerCase() || ".bin";
    // baza nazwy: ascii, bez spacji/diakrytyków
    const base = path
      .basename(file.originalname || "upload", rawExt)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${base || "upload"}-${unique}${ext}`);
  },
});

/* ================================================================================================
   Multer: filtr — tylko obrazy
   (jeśli format nie przejdzie, NIE rzucamy błędu, tylko ustawiamy flagę w req i odrzucamy plik)
================================================================================================ */
const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  // jeśli chcesz dodać inne typy (np. svg+xml, heic), dopisz je tutaj
  const ok =
    /image\/(jpeg|png|webp|gif|avif|svg\+xml|heic|heif)/i.test(file.mimetype) ||
    // niektóre systemy potrafią wysyłać svg jako text/xml
    /image\/svg/i.test(file.mimetype) ||
    /text\/xml/i.test(file.mimetype);
  if (ok) cb(null, true);
  else {
    (req as any).fileValidationError = "Only image files are allowed";
    cb(null, false);
  }
};

/* ================================================================================================
   Multer instance (limit 10 MB)
================================================================================================ */
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Akceptuj oba pola: "file" i "image"
const fields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

/* ================================================================================================
   Utils
================================================================================================ */
function actorIdFromReq(req: Request): string {
  return ((req as any).user?.id || (req as any).userId || "admin") as string;
}
function safeUnlink(p: string) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/* ================================================================================================
   Wspólny handler uploadu (używany przez dwa aliasy)
================================================================================================ */
async function handleUpload(req: Request, res: Response) {
  const productId = String(req.params.id || "");

  (req as any).log?.info(
    {
      route: "upload-image",
      productId,
      files: Object.keys((req as any).files || {}),
      fileValidationError: (req as any).fileValidationError || null,
    },
    "[adminProductMedia] incoming upload"
  );

  if (!productId) return res.status(400).json({ error: "Product id required" });

  // wyciągnij plik z któregoś pola
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const file =
    (files.file && files.file[0]) ||
    (files.image && files.image[0]) ||
    undefined;

  // jeśli filtr odrzucił plik albo go nie ma
  if (!file) {
    const msg = (req as any).fileValidationError || "file required (field: file or image)";
    return res.status(400).json({ error: msg });
  }

  try {
    // sprawdź produkt
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      // sprzątanie (gdy już zapisano plik)
      if (file.filename) safeUnlink(path.join(uploadDir, file.filename));
      return res.status(404).json({ error: "Product not found" });
    }

    // position = następny indeks
    const position = await prisma.media.count({ where: { productId } });
    const url = `/uploads/${file.filename}`;

    const media = await prisma.media.create({
      data: {
        productId,
        url,
        kind: "image", // enum MediaType → "image"
        position,
      },
    });

    await logAdminAction({
      actorId: actorIdFromReq(req),
      action: "PRODUCT_ADD_IMAGE",
      entityType: "Product",
      entityId: productId,
      after: { mediaId: media.id, url, position },
    });

    (req as any).log?.info({ mediaId: media.id, url }, "[adminProductMedia] upload OK");
    return res.json({ ok: true, media });
  } catch (err: any) {
    // jeśli coś się wywaliło po zapisaniu pliku – posprzątaj
    if ((files as any)?.file?.[0]?.filename) {
      safeUnlink(path.join(uploadDir, (files as any).file[0].filename));
    }
    if ((files as any)?.image?.[0]?.filename) {
      safeUnlink(path.join(uploadDir, (files as any).image[0].filename));
    }
    (req as any).log?.error({ err }, "[adminProductMedia] upload failed");
    return res.status(500).json({ error: err?.message || "Upload failed" });
  }
}

/* Lokalny error–handler (np. LIMIT_FILE_SIZE) */
function multerErrorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (!err) return res.status(400).json({ error: "Upload failed" });
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Plik za duży (max 10 MB)." });
  }
  if (typeof err.message === "string") {
    return res.status(400).json({ error: err.message });
  }
  return res.status(400).json({ error: "Upload failed" });
}

/* ================================================================================================
   POST /api/admin/products/:id/upload-image
   multipart/form-data; pole "file" lub "image"
================================================================================================ */
adminProductMedia.post(
  "/products/:id/upload-image",
  requireAuth,
  requireRole("ADMIN"),
  requireCsrf,
  fields,
  handleUpload,
  multerErrorHandler
);

/* ================================================================================================
   Alias: POST /api/admin/products/:id/images
================================================================================================ */
adminProductMedia.post(
  "/products/:id/images",
  requireAuth,
  requireRole("ADMIN"),
  requireCsrf,
  fields,
  handleUpload,
  multerErrorHandler
);

/* ================================================================================================
   DELETE /api/admin/media/:id
================================================================================================ */
adminProductMedia.delete(
  "/media/:id",
  requireAuth,
  requireRole("ADMIN"),
  requireCsrf,
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");
    (req as any).log?.info({ route: "delete-image", mediaId: id }, "[adminProductMedia] delete");

    if (!id) return res.status(400).json({ error: "id required" });

    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) return res.status(404).json({ error: "Media not found" });

    await prisma.media.delete({ where: { id } });

    await logAdminAction({
      actorId: actorIdFromReq(req),
      action: "PRODUCT_DELETE_IMAGE",
      entityType: "Product",
      entityId: media.productId,
      before: media,
      meta: { mediaId: id },
    });

    // usuń fizyczny plik
    try {
      const safeName = path.basename(media.url || "");
      if (safeName) {
        const filePath = path.join(uploadDir, safeName);
        safeUnlink(filePath);
      }
    } catch {
      /* ignore */
    }

    res.json({ ok: true });
  }
);

/* ================================================================================================
   (Opcjonalnie) REORDER: PATCH /api/admin/products/:id/media/reorder
   Body: { ids: string[] } → ustawia position wg kolejności w tablicy
================================================================================================ */
adminProductMedia.patch(
  "/products/:id/media/reorder",
  requireAuth,
  requireRole("ADMIN"),
  requireCsrf,
  async (req: Request, res: Response) => {
    const productId = String(req.params.id || "");
    const { ids } = (req.body || {}) as { ids?: string[] };

    if (!productId) return res.status(400).json({ error: "Product id required" });
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids (string[]) required" });
    }

    const medias = await prisma.media.findMany({
      where: { productId, id: { in: ids } },
      select: { id: true },
    });
    const validIds = new Set(medias.map((m) => m.id));
    const filtered = ids.filter((i) => validIds.has(i));

    await prisma.$transaction(
      filtered.map((id, index) =>
        prisma.media.update({ where: { id }, data: { position: index } })
      )
    );

    await logAdminAction({
      actorId: actorIdFromReq(req),
      action: "PRODUCT_MEDIA_REORDER",
      entityType: "Product",
      entityId: productId,
      meta: { order: filtered },
    });

    res.json({ ok: true });
  }
);

export default adminProductMedia;
