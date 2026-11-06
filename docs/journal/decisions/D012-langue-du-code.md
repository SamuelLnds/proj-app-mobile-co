# D012 · Code en anglais ; commentaires, documentation et textes affichés en français

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Modèle de données, glossaire](../../conception/01-modele-donnees.md) · [Cartographie technique](../../conception/03-cartographie-technique.md) |

## Contexte

Le groupe est francophone et la documentation est en français. Il faut une règle unique pour nommer les tables, colonnes, champs, routes, topics, fichiers et variables, afin que tout le monde écrive le code de la même façon.

## Options étudiées

| Critère | Tout en français | Métier en français, technique en anglais | Code en anglais, commentaires et documentation en français |
|---|---|---|---|
| Cohérence avec les bibliothèques (`useQuery`, `findMany`…) | Faible | Moyenne (mélange dans une même ligne) | Forte |
| Pratique professionnelle courante | Rare | Rare | Standard |
| Lisibilité pour le groupe | Forte | Forte | Forte, avec un glossaire |
| Risque d'incohérence entre membres | Faible | Élevé (où placer la frontière ?) | Faible : la règle est simple |
| Lien avec la documentation | Direct | Direct | Assuré par un glossaire français ↔ anglais |

Une première proposition retenait le vocabulaire métier en français dans le code. Elle a été écartée par le groupe : le code doit suivre la convention standard.

## Décision

- **En anglais** : tout ce qui est du code ou un identifiant technique. Tables, colonnes, enums et leurs valeurs, champs JSON, topics MQTT, routes, codes d'erreur, noms de fichiers et de dossiers, variables, fonctions, types, variables d'environnement, messages de commit.
- **En français** : les **commentaires** dans le code, la **documentation** (`docs/`, README, journal), les **textes affichés à l'utilisateur** (interface de l'app, messages d'erreur `message` de l'API, messages des alertes et des notifications).

## Justification

Règle simple, sans zone grise, conforme aux usages professionnels et aux bibliothèques utilisées. Le glossaire évite toute ambiguïté entre la documentation et le code.

## Conséquences

- Glossaire de référence dans [01-modele-donnees.md](../../conception/01-modele-donnees.md) (par exemple consigne → `setpoint`, panneau → `panel`, objet → `device`, restitution → `discharge`).
- Base : `snake_case`, tables au pluriel. TypeScript et JSON : `camelCase`. Routes : `kebab-case`. Constantes : `UPPER_SNAKE_CASE`.
- Les documents de conception ont été renommés en conséquence le 2026-11-06.
- La règle sera reprise dans `CLAUDE.md` (étape 4).
