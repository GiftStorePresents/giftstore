// src/types/passport-apple.d.ts
declare module "passport-apple" {
  import type { Strategy as PassportStrategy } from "passport";

  interface AppleStrategyOptions {
    clientID: string;
    teamID: string;
    keyID: string;
    key: string;                 // to pole faktycznie działa
    callbackURL: string;
    scope?: string[];
  }

  type VerifyCallback = (
    accessToken: string,
    refreshToken: string,
    idToken: any,
    profile: any,
    done: (err: any, user?: any, info?: any) => void
  ) => void;

  class Strategy extends PassportStrategy {
    constructor(options: AppleStrategyOptions, verify: VerifyCallback);
  }

  export = Strategy;
}
