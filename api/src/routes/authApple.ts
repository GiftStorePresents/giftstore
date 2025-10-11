// src/routes/authApple.ts
import { Router, type Request, type Response } from "express";
import passport from "passport";
import "../lib/passportApple"; // rejestracja strategii
import { prisma } from "../lib/prisma";
import { setAuthCookie } from "../middleware/requireAuth";

const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

// Spójne opcje dla ciasteczka koszyka
const CART_COOKIE = "cartId";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const router: Router = Router();

// /api/auth/apple → przekieruje do Apple
router.get("/apple", passport.authenticate("apple"));

// /api/auth/apple/callback → odbiera z Apple
router.get(
  "/apple/callback",
  passport.authenticate("apple", { session: false, failureRedirect: "/login?err=apple" }),
  async (req: Request, res: Response) => {
    try {
      // Strategia powinna dać użytkownika
      const payload = req.user as {
        user: { id: string; email: string; name: string | null };
      };

      const userId = payload?.user?.id;
      if (!userId) {
        return res.redirect(`${SITE_URL}/login?error=apple_no_user`);
      }

      // Pobierz tokenVersion i ustaw JWT
      const userRow = await (prisma as any).user.findUnique({
        where: { id: userId },
        select: { tokenVersion: true },
      });
      const tokenVersion: number = (userRow?.tokenVersion as number | undefined) ?? 0;

      setAuthCookie(res, { sub: userId, v: tokenVersion });

      // Koszyk (upewnij się, że istnieje, scal z gościa)
      let userCart = await prisma.cart.findFirst({ where: { userId } });
      if (!userCart) userCart = await prisma.cart.create({ data: { userId } });

      const guestCartId = (req as any).cookies?.[CART_COOKIE] as string | undefined;
      if (guestCartId && guestCartId !== userCart.id) {
        const guest = await prisma.cart.findUnique({
          where: { id: guestCartId },
          include: { items: true },
        });
        if (guest && guest.items.length) {
          const current = await prisma.cart.findUnique({
            where: { id: userCart.id },
            include: { items: true },
          });
          const byVariant = new Map(current!.items.map((it) => [it.variantId, it]));
          for (const gi of guest.items) {
            const existing = byVariant.get(gi.variantId);
            if (existing) {
              await prisma.cartItem.update({
                where: { id: existing.id },
                data: { qty: existing.qty + gi.qty },
              });
            } else {
              await prisma.cartItem.create({
                data: { cartId: userCart.id, variantId: gi.variantId, qty: gi.qty },
              });
            }
          }
          await prisma.cartItem.deleteMany({ where: { cartId: guest.id } });
          await prisma.cart.delete({ where: { id: guest.id } });
        }
      }

      res.cookie(CART_COOKIE, userCart.id, COOKIE_OPTS);

      // Redirect na frontend po zalogowaniu
      res.redirect(`${SITE_URL}/?login=apple_ok`);
    } catch (e) {
      console.error("[apple/callback] error:", e);
      res.redirect(`${SITE_URL}/login?error=apple_failed`);
    }
  }
);

export default router;
