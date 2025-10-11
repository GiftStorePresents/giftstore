// src/routes/adminProductMedia.ts
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

// --- katalog uploadów (spójny z server.ts: process.cwd()/uploads) ---
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// --- Multer: storage + bezpieczna nazwa ---
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || "") || "").toLowerCase();
    const base = path
      .basename(file.originalname || "upload", ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${base || "upload"}-${unique}${ext}`);
  },
});

// --- Multer: filtr tylko obrazki (bez rzucania Error do cb) ---
const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  // Możesz dopisać heic/heif/svg+xml jeśli chcesz je obsługiwać
  const ok = /image\/(jpeg|png|webp|gif|avif|heic|heif|svg\+xml)/i.test(file.mimetype);
  if (ok) {
    cb(null, true);
  } else {
    (req as any).fileValidationError = "Only image files are allowed";
    cb(null, false);
  }
};

// --- Multer instance ---
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

/** Wspólny handler uploadu (używany dla dwóch ścieżek) */
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
      // posprzątaj zapisany plik (gdyby jednak przeszedł)
      try {
        if (file.filename) fs.unlinkSync(path.join(uploadDir, file.filename));
      } catch {}
      return res.status(404).json({ error: "Product not found" });
    }

    // Ustal pozycję jako kolejną (liczba istniejących mediów)
    const position = await prisma.media.count({ where: { productId } });

    const url = `/uploads/${file.filename}`;
    const media = await prisma.media.create({
      data: {
        productId,
        url,
        kind: "image",
        position,
      },
    });

    await logAdminAction({
      actorId: (req as any).userId,
      action: "PRODUCT_ADD_IMAGE",
      entityType: "Product",
      entityId: productId,
      after: { mediaId: media.id, url },
    });

    (req as any).log?.info({ mediaId: media.id, url }, "[adminProductMedia] upload OK");
    return res.json({ ok: true, media });
  } catch (err: any) {
    // jeśli coś się wywaliło po zapisaniu pliku – spróbuj posprzątać
    try {
      if (file.filename) fs.unlinkSync(path.join(uploadDir, file.filename));
    } catch {}
    (req as any).log?.error({ err }, "[adminProductMedia] upload failed");
    return res.status(500).json({ error: err?.message || "Upload failed" });
  }
}

/** Lokalny error–handler (np. LIMIT_FILE_SIZE) */
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

/**
 * POST /api/admin/products/:id/upload-image
 * multipart/form-data; pole "file" lub "image"
 */
adminProductMedia.post(
  "/products/:id/upload-image",
  requireAuth,
  requireRole("ADMIN"),
  requireCsrf,
  fields,
  handleUpload,
  multerErrorHandler
);

/**
 * Alias:
 * POST /api/admin/products/:id/images
 */
adminProductMedia.post(
  "/products/:id/images",
  requireAuth,
  requireRole("ADMIN"),
  requireCsrf,
  fields,
  handleUpload,
  multerErrorHandler
);

/**
 * DELETE /api/admin/media/:id
 */
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
      actorId: (req as any).userId,
      action: "PRODUCT_DELETE_IMAGE",
      entityType: "Product",
      entityId: media.productId,
      before: media,
      meta: { mediaId: id },
    });

    // usuń fizyczny plik
    try {
      const filePath = path.join(uploadDir, path.basename(media.url));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}

    res.json({ ok: true });
  }
);

export default adminProductMedia;
