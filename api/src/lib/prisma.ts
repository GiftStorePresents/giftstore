// src/lib/prisma.ts
//import { PrismaClient, Prisma } from "@prisma/client";
// zamiast:
// import { PrismaClient } from "@prisma/client";

// W trybie testów możesz włączyć pełne logi ustawiając PRISMA_DEBUG=1
// src/lib/prisma.ts
import { PrismaClient, Prisma } from "../generated/client";

const logs: Prisma.LogLevel[] =
  process.env.PRISMA_DEBUG === "1"
    ? ["query", "info", "warn", "error"]
    : ["warn", "error"];

export const prisma = new PrismaClient({ log: logs });
export default prisma;
