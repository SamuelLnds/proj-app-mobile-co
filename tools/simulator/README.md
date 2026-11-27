# Simulateur

Outil de développement et de démonstration, jamais déployé ([D015](../../docs/journal/decisions/D015-emplacement-simulateur.md)). Il publie les mesures des 20 panneaux du parc et peut jouer l'objet du site à la place de l'ESP32 de Wokwi ([D024](../../docs/journal/decisions/D024-objet-simule-et-connexion-wokwi.md)). Comportement détaillé : section 5.4 de la [cartographie technique](../../docs/conception/03-cartographie-technique.md).

## Lancer

Depuis la racine, avec le broker démarré : `pnpm dev` lance l'API et le simulateur ensemble, ou `pnpm --filter simulator dev` le simulateur seul. Variables dans `tools/simulator/.env` (copie de `.env.example`).

| Mode                                   | Connexion                                                                       | Ce qu'il fait                                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panneaux (toujours)                    | Écoute locale 1883, compte `simulator` et son mot de passe                      | Une mesure par panneau toutes les 10 s, qui suit l'ensoleillement de la dernière mesure du site ; `FAULTY_PANELS` divise la production de certains panneaux par 5, `EXTRA_PANELS` ajoute des panneaux absents du seed |
| Objet du site (`SIMULATE_DEVICE=true`) | Écoute TLS 8883, **certificat client obtenu par enrôlement**, sans mot de passe | Mesures du site toutes les 5 s, statut et Last Will, consignes appliquées par l'algorithme de référence du firmware (`src/device/control.ts`)                                                                         |

En mode objet du site, le simulateur s'enrôle comme l'ESP32 ([D027](../../docs/journal/decisions/D027-certificat-objet-et-enrolement.md)) : clé générée en mémoire, empreinte affichée dans le terminal, demande à l'API (`API_URL`), puis attente de l'acceptation dans l'app (écran **Objets**, compte exploitant). Un certificat révoqué, refusé ou expiré relance l'enrôlement avec une nouvelle clé. L'API doit tourner. **Ne jamais l'activer en même temps que l'ESP32 de Wokwi** : deux objets publieraient les mesures de `SITE01`.

## Organisation

```
src/
├── index.ts, simulator.ts, config.ts, mqtt-client.ts   Démarrage, aiguillage des modes, configuration
├── panels/     Mesures des panneaux
└── device/     Objet du site : algorithme de pilotage (control.ts), batterie et soleil, enrôlement
                (identity.ts, enrollment.ts) et connexion par certificat (run-enrolled-device.ts)
```

## Tests

`pnpm --filter simulator test`. Les tests `firmware-*.test.ts` compilent aussi la logique du firmware (`firmware/site-device/include`) sur le poste et la comparent au simulateur et aux schémas de `@solar/contracts`. Ils demandent un compilateur C++ (`g++` ou `clang++`) : sans lui, sous Windows par exemple, ils sont ignorés, et la CI les exécute.
