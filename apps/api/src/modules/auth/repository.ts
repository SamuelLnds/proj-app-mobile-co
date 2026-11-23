// Requêtes sur les utilisateurs.
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { users } from "../../db/schema";

export type UserRow = typeof users.$inferSelect;

export interface AuthRepository {
  findUserByEmail: (email: string) => Promise<UserRow | null>;
  findUserById: (id: string) => Promise<UserRow | null>;
}

export function createAuthRepository({ db }: Database): AuthRepository {
  return {
    async findUserByEmail(email) {
      // `email` est de type citext : la comparaison ignore la casse.
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user ?? null;
    },
    async findUserById(id) {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user ?? null;
    },
  };
}
