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

## Sources

- <https://r3f.docs.pmnd.rs>
