import { prisma } from "../lib/prisma";

type LogInput = {
  actorId: string;
  action: string;
  entityType: "User" | "Product" | "Variant";
  entityId: string;
  before?: any;
  after?: any;
  meta?: any;
};

export async function logAdminAction(input: LogInput) {
  const { actorId, action, entityType, entityId, before, after, meta } = input;
  try {
    await prisma.adminAction.create({
      data: {
        actorId,
        action,
        entityType,
        entityId,
        before: before ?? null,
        after: after ?? null,
        meta: meta ?? null,
      },
    });
  } catch (e) {
    console.warn("[adminLog] failed:", e);
  }
}
