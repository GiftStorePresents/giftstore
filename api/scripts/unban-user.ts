import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Użycie: pnpm tsx scripts/unban-user.ts user@domain.com");
    process.exit(1);
  }
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) {
    console.error("Nie ma takiego użytkownika:", email);
    process.exit(2);
  }
  await prisma.user.update({ where: { id: u.id }, data: { disabledAt: null } });
  console.log("OK – odbanowano:", email);
}
main().finally(() => prisma.$disconnect());
