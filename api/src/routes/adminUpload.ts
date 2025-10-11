// src/routes/adminUpload.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import multer, { type FileFilterCallback } from "multer";

const router: Router = Router();

/** Tylko dla ADMINA */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  next();
}

/** Bezpieczne segmenty (folder, nazwa pliku w query) */
function safeSegment(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
}

/** Ścieżka bazowa uploadów */
const uploadsRoot = path.join(process.cwd(), "uploads");

/** Multer storage: /uploads/{folder}/{nazwa}-{timestamp}.{ext} */
const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const folder = safeSegment(String(req.query.folder || "blog"));
    const dest = path.join(uploadsRoot, folder);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = safeSegment(path.basename(file.originalname, ext));
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb: FileFilterCallback) {
    const mt = String(file.mimetype || "").toLowerCase();
    const ok =
      mt.startsWith("image/") ||
      mt === "image/svg+xml" ||
      mt === "image/svg" ||
      mt.includes("svg");

    // ✅ poprawny sposób wywołania callbacku wg typów Multera
    if (ok) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

/** POST /api/admin/upload?folder=blog  (form-data: file) */
router.post(
  "/upload",
  requireAdmin,
  (req, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) return next(err);
      next();
    });
  },
  (req: Request, res: Response) => {
    const folder = safeSegment(String(req.query.folder || "blog"));
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "no file" });

    const url = `/uploads/${folder}/${file.filename}`;
    res.json({ ok: true, url, name: file.filename, size: file.size });
  }
);

/** GET /api/admin/upload/list?folder=blog — lista plików */
router.get("/upload/list", requireAdmin, async (req: Request, res: Response) => {
  const folder = safeSegment(String(req.query.folder || "blog"));
  const dir = path.join(uploadsRoot, folder);
  if (!fs.existsSync(dir)) return res.json({ folder, items: [] });

  const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  const items = files.map((name) => {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    return {
      name,
      url: `/uploads/${folder}/${name}`,
      size: st.size,
      mtime: st.mtime.toISOString(),
    };
  });
  res.json({ folder, items });
});

/** DELETE /api/admin/upload?folder=blog&name=plik.jpg */
router.delete("/upload", requireAdmin, async (req: Request, res: Response) => {
  const folder = safeSegment(String(req.query.folder || "blog"));
  const name = safeSegment(String(req.query.name || ""));
  if (!name) return res.status(400).json({ error: "missing name" });

  const abs = path.join(uploadsRoot, folder, name);
  const norm = path.normalize(abs);
  if (!norm.startsWith(uploadsRoot)) return res.status(400).json({ error: "bad path" });

  if (!fs.existsSync(norm)) return res.status(404).json({ error: "not found" });
  fs.unlinkSync(norm);
  res.json({ ok: true });
});

/** Łagodny handler błędów uploadu (limit/mimetype) */
router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err && (err.name === "MulterError" || /image files/i.test(String(err.message)))) {
    return res.status(400).json({ error: err.message || "Upload error" });
  }
  next(err);
});

export default router;
