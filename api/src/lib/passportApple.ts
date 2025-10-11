// src/lib/passportApple.ts
import passport from "passport";
import AppleStrategy from "passport-apple";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";

const {
  APPLE_CLIENT_ID,
  APPLE_TEAM_ID,
  APPLE_KEY_ID,
  APPLE_PRIVATE_KEY,
  API_URL = "http://localhost:4000",
} = process.env;

if (!APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
  console.warn("[passport-apple] Missing env vars (APPLE_*). Apple login will not work.");
}

// Jeśli klucz jest w .env w jednej linii, zamień \n na nowe linie
const APPLE_KEY = (APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

// Callback musi być identyczny jak w Apple Developer
const CALLBACK_URL = `${API_URL.replace(/\/+$/, "")}/api/auth/apple/callback`;

passport.use(
  new AppleStrategy(
    {
      clientID: APPLE_CLIENT_ID!,
      teamID: APPLE_TEAM_ID!,
      keyID: APPLE_KEY_ID!,
      key: APPLE_KEY,           // ← poprawne pole (NIE privateKeyString)
      callbackURL: CALLBACK_URL,
      scope: ["name", "email"],
    },
    async (accessToken, refreshToken, idToken, profile, done) => {
      try {
        // Apple bywa skąpe: e-mail zwykle tylko przy pierwszym razie
        const appleId: string | undefined = (profile as any)?.id ?? (idToken as any)?.sub;
        const email: string | null =
          (profile as any)?.emails?.[0]?.value ??
          (profile as any)?.email ??
          (idToken as any)?.email ??
          null;

        if (!appleId) return done(null, false, { message: "Apple profile has no id" });

        // 1) Czy istnieje już konto OAuth?
        let account = await prisma.oAuthAccount.findUnique({
          where: { provider_providerId: { provider: "apple", providerId: appleId } },
          include: { user: true },
        });

        // 2) Jeśli nie – podpinamy lub tworzymy usera
        if (!account) {
          let user =
            email ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } }) : null;

          if (!user) {
            user = await prisma.user.create({
              data: {
                email: email ?? `apple_${appleId}@example.invalid`,
                verifiedAt: new Date(),
              },
            });
          }

          account = await prisma.oAuthAccount.create({
            data: {
              provider: "apple",
              providerId: appleId,
              userId: user.id,
            },
            include: { user: true },
          });
        }

        // Nic nie zwracamy z JWT tutaj – cookie ustawimy w routerze
        return done(null, { id: account.user.id, email: account.user.email, name: account.user.name ?? null });
      } catch (e) {
        console.error("[passport-apple] verify error:", e);
        return done(e);
      }
    }
  )
);

// brak serialize/deserialize – używamy JWT w cookie
export {};
