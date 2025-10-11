// scripts/make-admin.ts
import { prisma } from "../src/lib/prisma";

const email = process.argv[2];
if (!email) {
  console.error("Użycie: pnpm tsx scripts/make-admin.ts <email>");
  process.exit(1);
}

(async () => {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) {
    console.error("Nie ma użytkownika o takim emailu");
    process.exit(2);
  }
  const out = await prisma.user.update({
    where: { id: u.id },
    data: { role: "ADMIN", disabledAt: null },
    select: { id: true, email: true, role: true, disabledAt: true },
  });
  console.log("OK:", out);
  process.exit(0);
})();
