// État appliqué courant de chaque site, conservé en mémoire (section 7.3 de la cartographie).
// Au redémarrage de l'API, il est relu grâce au message `state` retained du broker.
import type { ControlState } from "@solar/contracts";

export interface ControlStateStore {
  get: (siteCode: string) => ControlState | null;
  set: (siteCode: string, state: ControlState) => void;
}

export function createControlStateStore(): ControlStateStore {
  const states = new Map<string, ControlState>();
  return {
    get: (siteCode) => states.get(siteCode) ?? null,
    set: (siteCode, state) => {
      states.set(siteCode, state);
    },
  };
}
