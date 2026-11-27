// Authentification (séquence 4.1 de l'UML) : vérification argon2id et profil de l'utilisateur.
import type { LoginRequest, User, UserRole } from "@solar/contracts";
import argon2 from "argon2";
import { AppError, DEFAULT_MESSAGES } from "../../errors";
import type { AuthRepository, UserRow } from "./repository";

/** Contenu du JWT (section 7.1 de la cartographie). */
export interface TokenPayload {
  sub: string;
  role: UserRole;
}

export interface AuthService {
  /** Renvoie l'utilisateur si l'e-mail et le mot de passe sont corrects. */
  verifyCredentials: (body: LoginRequest) => Promise<User>;
  /** Profil de l'utilisateur d'un jeton valide ; 401 s'il n'existe plus. */
  getUser: (id: string) => Promise<User>;
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function createAuthService(repository: AuthRepository): AuthService {
  // Haché de référence : vérifié quand l'e-mail est inconnu, pour que la durée de réponse
  // ne révèle pas si le compte existe.
  const dummyHash = argon2.hash("compte-inexistant", { type: argon2.argon2id });

  return {
    async verifyCredentials({ email, password }) {
      const row = await repository.findUserByEmail(email);
      const valid = row
        ? await argon2.verify(row.passwordHash, password)
        : await argon2.verify(await dummyHash, password).then(() => false);
      if (!row || !valid) {
        // Même erreur que l'e-mail ou le mot de passe soit faux.
        throw new AppError("INVALID_CREDENTIALS", DEFAULT_MESSAGES.INVALID_CREDENTIALS);
      }
      return toUser(row);
    },

    async getUser(id) {
      const row = await repository.findUserById(id);
      if (!row) throw new AppError("UNAUTHENTICATED", DEFAULT_MESSAGES.UNAUTHENTICATED);
      return toUser(row);
    },
  };
}
