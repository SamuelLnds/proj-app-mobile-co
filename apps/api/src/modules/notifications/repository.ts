// Requêtes sur les jetons de notification push.
import { and, eq, inArray } from "drizzle-orm";
import type { MobilePlatform } from "@solar/contracts";
import type { Database } from "../../db/client";
import { pushTokens } from "../../db/schema";

export interface PushTokensRepository {
  /** Insère le jeton ou le réattribue à l'utilisateur (un jeton n'a qu'un propriétaire). */
  upsert: (userId: string, token: string, platform: MobilePlatform) => Promise<void>;
  /** Supprime le jeton s'il appartient à l'utilisateur. */
  remove: (userId: string, token: string) => Promise<void>;
  /** Jetons de tous les utilisateurs (destinataires d'une alerte). */
  listTokens: () => Promise<string[]>;
  /** Supprime des jetons refusés par Expo, quel que soit leur propriétaire. */
  removeTokens: (tokens: string[]) => Promise<void>;
}

export function createPushTokensRepository({ db }: Database): PushTokensRepository {
  return {
    async upsert(userId, token, platform) {
      await db
        .insert(pushTokens)
        .values({ userId, token, platform })
        .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform } });
    },
    async remove(userId, token) {
      await db
        .delete(pushTokens)
        .where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)));
    },
    async listTokens() {
      const rows = await db.select({ token: pushTokens.token }).from(pushTokens);
      return rows.map((row) => row.token);
    },
    async removeTokens(tokens) {
      if (tokens.length === 0) return;
      await db.delete(pushTokens).where(inArray(pushTokens.token, tokens));
    },
  };
}
