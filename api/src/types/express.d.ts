// src/types/express.d.ts
import "express";

declare module "express-serve-static-core" {
  interface Request {
    /** Ustawiane przez requireAuth po poprawnej weryfikacji JWT */
    userId?: string;
  }
}
