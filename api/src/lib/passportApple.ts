// src/lib/passportApple.ts
import passport from "passport";
import AppleStrategy from "passport-apple";
import { prisma } from "./prisma";

const DISABLE_OAUTH = process.env.AUTH_DISABLE_OAUTH === "true";

const {
  APPLE_CLIENT_ID = "",
  APPLE_TEAM_ID = "",
  APPLE_KEY_ID = "",
  APPLE_PRIVATE_KEY = "",
  API_URL = "http://localhost:4000",
} = process.env;

// Jeśli klucz jest w .env w jednej linii, zamień \n na nowe linie
const APPLE_KEY = (APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

// Callback musi odpowiadać temu w Apple Developer
const CALLBACK_URL = `${API_URL.replace(/\/+$/, "")}/api/auth/apple/callback`;

const hasAppleCreds =
  Boolean(APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_KEY);

if (!DISABLE_OAUTH && hasAppleCreds) {
  passport.use(
    new AppleStrategy(
      {
        clientID: APPLE_CLIENT_ID,
        teamID: APPLE_TEAM_ID,
        keyID: APPLE_KEY_ID,
        key: APPLE_KEY, // <- poprawne pole (nie privateKeyString)
        callbackURL: CALLBACK_URL,
        scope: ["name", "email"],
      },
      // verify callback
      async (
        _accessToken: string,
        _refreshToken: string,
        idToken: any,
        profile: any,
        done: (err: any, user?: any, info?: any) => void
      ) => {
        try {
          // Apple często nie zwraca e-maila przy kolejnych logowaniach
          const appleId: string | undefined = profile?.id ?? idToken?.sub;
          const emailRaw: string | undefined =
            profile?.email ??
            profile?.emails?.[0]?.value ??
            idToken?.email;

          if (!appleId) {
            return done(null, false, { message: "Apple profile has no id" });
          }

          const email = emailRaw ? emailRaw.toLowerCase() : null;

          // 1) Czy istnieje już konto OAuth?
          let account = await prisma.oAuthAccount.findUnique({
            where: { provider_providerId: { provider: "apple", providerId: appleId } },
            include: { user: true },
          });

          // 2) Jeśli nie — podpinamy do istniejącego usera po e-mailu albo tworzymy nowego
          if (!account) {
            let user =
              email ? await prisma.user.findUnique({ where: { email } }) : null;

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

          return done(null, {
            id: account.user.id,
            email: account.user.email,
            name: account.user.name ?? null,
          });
        } catch (e) {
          console.error("[passport-apple] verify error:", e);
          return done(e);
        }
      }
    )
  );
} else {
  console.warn(
    "[passport-apple] OAuth disabled or missing envs — strategy not registered.",
    DISABLE_OAUTH ? "AUTH_DISABLE_OAUTH=true" : "missing APPLE_* variables"
  );
}

// Brak serialize/deserialize – JWT w cookie ustawiasz w swoich routerach
export {};
