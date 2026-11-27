# D013 · Vue 3D en bonus, avec React Three Fiber

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Étude de faisabilité](../../etude-faisabilite-parc-solaire.md), section 8 |

## Contexte

Un membre du groupe souhaite une visualisation 3D du parc. Elle n'est pas attendue par le module et peut consommer beaucoup de temps.

## Options étudiées

| Critère | three.js dans l'app (React Three Fiber + `expo-gl`) | Carte « 2,5D » (polygones extrudés) | 3D sur un tableau de bord web | Unity ou Cesium |
|---|---|---|---|---|
| Lien avec les données en direct | Fort (scène générée depuis la base) | Moyen | Fort | Possible |
| Effort | Moyen | Faible | Moyen + deuxième front-end | Très élevé |
| Reste dans l'app mobile | Oui | Oui | Non | Oui |
| Performances sur téléphone | À surveiller | Bonnes | Sans objet | Lourdes |

## Décision

Vue 3D en **bonus n°1**, réalisée avec **React Three Fiber** dans un écran dédié de l'app, **après** le socle, avec un budget d'environ **15 h**.

## Justification

L'option la plus cohérente avec la stack (React) et la plus liée aux données. Le statut de bonus protège le socle.

## Conséquences

- Panneaux générés à partir des positions en base, colorés selon leur statut ; aucune modélisation 3D manuelle.
- La 3D n'apporte aucune information exclusive (accessibilité).
- Si le budget est dépassé, on s'arrête là où on en est.

## Suivi (#58, 2026-11-27)

- Réalisée comme troisième vue de l'écran Carte (« Plan », « 3D », « Liste ») plutôt qu'un écran à part : la sélection d'un panneau et sa fiche restent les mêmes que dans le plan.
- Paquets : `three` 0.187, `@react-three/fiber` 9.8 (version native), `expo-gl`, ainsi que `expo-asset` et `expo-file-system` qu'elle demande. La scène est chargée à la demande : une version de l'app construite sans `expo-gl` affiche un message et renvoie vers le plan et la liste au lieu de planter.
- Panneaux en boîtes simples (1,7 m × 1 m, inclinés de 30°), placés en mètres depuis le centre du parc, couleurs des jetons de la charte selon le statut. Le lecteur d'écran reçoit un résumé (nombre de panneaux, en alerte, sans données) et est renvoyé vers la vue Liste.
- La fluidité sur le téléphone de test avec les 20 panneaux reste à vérifier sur l'appareil.

## Sources

- <https://r3f.docs.pmnd.rs>
