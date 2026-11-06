# D020 · Inventaire des panneaux : fichier de seed et rattachement automatique

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Modèle de données](../../conception/01-modele-donnees.md) · [UML, UC17 et séquence 4.6](../../conception/02-uml.md) · [Cartographie, section 7](../../conception/03-cartographie-technique.md) |

## Contexte

La conception initiale ne prévoyait aucun moyen d'inscrire les panneaux d'un parc : le site et ses 20 panneaux étaient créés par le script de données de démonstration. Pour exister dans le système, un panneau a besoin d'un code (lien avec le topic MQTT), d'une position (carte), d'une puissance nominale (production attendue) et d'un site.

## Options étudiées

| Critère | A. Fichier de seed | B. Import d'un plan (CSV, GeoJSON) | C. Rattachement automatique | D. Ajout sur le terrain (QR code + GPS) |
|---|---|---|---|---|
| Geste utilisateur | Aucun (développeur) | Import d'un fichier | Positionner un panneau détecté | Scanner, puis valider |
| Réalisme | Faible | Fort pour un grand parc | Fort : le matériel se déclare | Fort pour un technicien |
| Développement | Nul | Moyen | Faible à moyen | Élevé (caméra, formulaire, localisation) |
| Démonstration | — | Peu visuelle | Un panneau ajouté au simulateur apparaît dans l'app | Très visuelle |
| Risque | — | Fichier mal formé | Faux panneau si un code est erroné (suppression nécessaire) | Permissions caméra et localisation |

## Décision

- **Socle : A + C.** Le seed crée le parc de démonstration à partir d'un fichier JSON versionné. Quand l'API reçoit des mesures d'un code de panneau inconnu, elle crée le panneau à l'état « non positionné ». L'exploitant le positionne depuis l'app avec la position GPS du téléphone, peut corriger son nom et sa puissance, ou le supprimer.
- **Bonus : D**, ajout d'un panneau sur le terrain par scan d'un QR code.
- **Piste d'évolution : B**, import d'un plan de parc, citée dans le dossier.

## Justification

C'est le meilleur rapport entre coût et intérêt : aucun code à saisir, une démonstration simple (ajouter un panneau au simulateur), et l'usage d'un capteur du téléphone (GPS), dans l'esprit du module.

## Conséquences

- Base : `panels.latitude` et `panels.longitude` deviennent facultatives (les deux ou aucune) ; nouvelle colonne `panels.source` (`seed`, `discovered`, `manual`).
- API : création automatique bornée (format du code, nombre maximal de panneaux par site) ; nouvelles routes `PATCH` et `DELETE /v1/panels/{id}`, réservées au rôle `operator`.
- App : section « Panneaux à positionner » dans la vue Liste de l'écran Carte ; dépendance `expo-location`.
- Simulateur : variable `EXTRA_PANELS` pour publier des panneaux absents du seed pendant la démo.
- Nouvelles issues sur GitHub et mise à jour de l'issue d'enregistrement des mesures des panneaux.
