# D034 · Alertes lues : état propre à chaque téléphone

| | |
|---|---|
| **Date** | 2026-11-26 |
| **Statut** | Acceptée |
| **Décideurs** | Le binôme |
| **Liens** | Issue [#104](https://github.com/SamuelLnds/proj-app-mobile-co/issues/104) · [D014](D014-stockage-local-sqlite.md) · [UML, UC09](../../conception/02-uml.md) · [Cartographie, section 5.3](../../conception/03-cartographie-technique.md) |

## Contexte

La pastille de l'onglet Alertes compte toutes les alertes **actives**. Elle ne baisse que lorsque le système résout l'alerte : tant que la cause dure, la pastille reste, et l'exploitant ne peut pas dire qu'il a déjà vu l'alerte. Un appui sur une alerte ouvre le panneau concerné sans rien changer à la pastille.

Le binôme veut pouvoir marquer une alerte comme lue depuis l'onglet Alertes. La question est de savoir **où** cet état est conservé : sur chaque téléphone, par utilisateur côté serveur, ou partagé par l'équipe.

## Options étudiées

| Critère | 1. État local à chaque téléphone (retenue) | 2. État par utilisateur côté serveur | 3. Acquittement partagé par l'équipe côté serveur |
|---|---|---|---|
| Stockage | Table SQLite locale `read_alerts` ([D014](D014-stockage-local-sqlite.md)) | Nouvelle table (par exemple `alert_reads`, utilisateur et alerte) en base | Colonne ou statut d'alerte en base (acquittée par, acquittée à) |
| Plusieurs téléphones | Chacun a ses alertes lues : un même utilisateur sur deux téléphones doit tout lire deux fois | L'état suit l'utilisateur sur tous ses téléphones | Une alerte acquittée l'est pour tout le monde |
| Changements à faire | App seule : table locale, hooks, écran | Modèle de données, migration, schéma Drizzle, routes, contrats, app | Modèle de données, migration, routes réservées au rôle `operator`, règles d'alerte, contrats, app |
| Ressemblance avec les outils de supervision | Faible : une alerte « vue » n'est pas un acquittement | Moyenne : proche d'une boîte de réception | Forte : c'est l'acquittement des outils de supervision |

## Décision

L'état « lu » est **propre à chaque téléphone** (option 1) : une table locale `read_alerts` dans la base SQLite de l'app, sans aucune donnée en plus côté API ni en base serveur.

## Justification

L'équipe est petite et l'usage visé est personnel : savoir quelles alertes on a déjà vues. L'option 1 ne change ni l'API, ni les contrats, ni la base : aucune route, aucune migration, aucun risque pour le socle déjà livré. Le changement est limité à l'app et réutilise le stockage local déjà en place. Les options 2 et 3 apportent la synchronisation entre téléphones, dont le besoin n'est pas établi, au prix d'un changement du modèle de données et de l'API.

## Conséquences

- Chaque téléphone a ses propres alertes lues ; la pastille d'un téléphone peut différer de celle d'un autre.
- Une alerte résolue puis rouverte est une **nouvelle** alerte (nouvel identifiant) : elle est de nouveau non lue.
- Au premier lancement après la mise à jour, les alertes déjà actives sont non lues.
- Les identifiants des alertes qui ne sont plus actives sont retirés de la mémoire locale ; la déconnexion efface la table avec le reste des données locales.
- L'écran Alertes diffère de la maquette actuelle (marqueur « Nouvelle », contrôle « Voir le panneau », bouton « Tout marquer comme lu ») : la maquette est à mettre à jour.
- Un acquittement partagé par l'équipe (option 3, rôle `operator`) reste possible plus tard : il ferait l'objet d'une nouvelle fiche.
- Documents à mettre à jour : UML (UC09), cartographie technique (section 5.3), charte graphique (marqueur « Nouvelle »), besoins fonctionnels (issue #104).

## Sources

Aucune source externe : choix de conception interne au projet.
