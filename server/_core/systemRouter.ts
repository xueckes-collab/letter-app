import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import * as db from "../db";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(async () => {
      const checks: Record<string, unknown> = {
        ok: false,
        timestamp: new Date().toISOString(),
      };

      // Check database connectivity by running a real query
      try {
        // getUserByEmail will return undefined if no DB, or throw if DB is unreachable
        const testResult = await db.getUserByEmail("__health__@test.invalid");
        // If we get here without throwing, DB is connected
        checks.database = "connected";
        checks.ok = true;
      } catch (e) {
        checks.database = "disconnected";
        checks.databaseError =
          e instanceof Error
            ? e.cause instanceof Error
              ? e.cause.message
              : e.message
            : String(e);
        checks.ok = false;
      }

      return checks;
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return { success: delivered } as const;
    }),
});
