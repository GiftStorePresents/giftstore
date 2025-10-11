// src/lib/passport.ts
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "./prisma";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
// callback musi być dodany w Google Cloud Console
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || "http://localhost:4000/api/auth/google/callback";

// Używamy passporta BEZ sesji (session: false). Tylko po to, by dostać profil.
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    // (accessToken, refreshToken, profile, done)
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value?.toLowerCase() || null;
        const name = profile.displayName || null;
        const avatar = profile.photos?.[0]?.value || null;

        if (!email) {
          // bez e-maila nie chcemy zakładać konta
          return done(new Error("Google profile has no email"));
        }

        // 1) Spróbuj znaleźć po googleId lub email
        let user =
          (await prisma.user.findFirst({
            where: { OR: [{ googleId }, { email }] },
          })) || null;

        if (user) {
          // 2) Podłącz googleId, ustaw verifiedAt jeśli puste, uzupełnij brakujące pola
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
          // 3) Nowy użytkownik
          user = await prisma.user.create({
            data: {
              email,
              name,
              googleId,
              avatarUrl: avatar,
              verifiedAt: new Date(), // e-mail z Google traktujemy jako zweryfikowany
            },
          });
        }

        // do req.user przekażemy minimalny obiekt
        return done(null, { id: user.id });
      } catch (e) {
        return done(e as any);
      }
    }
  )
);

// nie korzystamy z sesji passporta – nie potrzebujemy serialize/deserialize
export default passport;
