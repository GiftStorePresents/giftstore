// src/lib/passport.ts
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "./prisma";

const DISABLE_OAUTH = process.env.AUTH_DISABLE_OAUTH === "true";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
// callback musi być też skonfigurowany w Google Cloud Console
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  "http://localhost:4000/api/auth/google/callback";

const hasGoogleCreds = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

// Rejestruj strategię TYLKO jeśli OAuth nie jest wyłączony i mamy komplet zmiennych
if (!DISABLE_OAUTH && hasGoogleCreds) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value?.toLowerCase() || null;
          const name = profile.displayName || null;
          const avatar = profile.photos?.[0]?.value || null;

          if (!email) return done(new Error("Google profile has no email"));

          // 1) znajdź po googleId/email
          let user =
            (await prisma.user.findFirst({
              where: { OR: [{ googleId }, { email }] },
            })) || null;

          if (user) {
            // 2) podłącz googleId + uzupełnij pola
            const dataUpdate: Record<string, any> = {};
            if (!user.googleId) dataUpdate.googleId = googleId;
            if (!user.verifiedAt) dataUpdate.verifiedAt = new Date();
            if (!user.name && name) dataUpdate.name = name;
            if (avatar) dataUpdate.avatarUrl = avatar;

            if (Object.keys(dataUpdate).length) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: dataUpdate,
              });
            }
          } else {
            // 3) nowy user
            user = await prisma.user.create({
              data: {
                email,
                name,
                googleId,
                avatarUrl: avatar,
                verifiedAt: new Date(),
              },
            });
          }

          return done(null, { id: user.id });
        } catch (e) {
          return done(e as any);
        }
      }
    )
  );
} else {
  // Nie rejestrujemy GoogleStrategy — brak zmiennych lub wyłączone
  console.warn(
    "[auth] Google OAuth disabled:",
    DISABLE_OAUTH
      ? "AUTH_DISABLE_OAUTH=true"
      : "missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET"
  );
}

// Nie używamy sesji Passporta
export default passport;
