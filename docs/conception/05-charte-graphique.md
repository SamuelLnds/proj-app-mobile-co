# 05 · Charte graphique et maquettes

> Étape 3 de la conception (issues #1 et #2). La charte de référence est le design system **Parc Solaire** ; les maquettes sont sur le canevas **Maquettes Parc Solaire**. Ce document en résume le contenu pour le dépôt et pour le dossier.

| Ressource | Lien |
|---|---|
| Design system (couleurs, typographie, espacements, icônes, règles d'usage) | <https://claude.ai/artifact/Vzkustx3GJxvjEr2CFtZJ5> |
| Maquettes (23 planches : écrans, états, thème sombre) | <https://claude.ai/artifact/4YzFv6oVex6W2wyRfaf8DP> |

Les deux liens sont privés tant qu'ils ne sont pas partagés depuis le menu « Partager » de chaque page.

## 1. Principes

- **Lisible au soleil** : texte principal en `ink` sur `surface` ou `surface-raised`, jamais d'information en petit texte gris seul.
- **Un état ne se lit jamais à la couleur seule** : chaque couleur d'état est accompagnée de son icône et d'un mot.
- **Les valeurs d'abord** : la valeur utile est l'élément le plus grand de l'écran, avec son unité et son ancienneté.
- **L'écran Pilotage montre ce que fait l'objet**, pas seulement ce qui lui a été demandé.
- **Zones tactiles d'au moins 48 px**, pour un usage avec des gants.

## 2. Couleurs

Noms de jetons en anglais ([D012](../journal/decisions/D012-langue-du-code.md)). Thème clair et thème sombre ([D018](../journal/decisions/D018-palette-et-themes.md)).

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `surface` | `#f4f7f6` | `#0e161b` | Fond des écrans |
| `surface-raised` | `#ffffff` | `#162128` | Cartes, barre d'onglets, dialogues |
| `surface-sunken` | `#e7edeb` | `#0a1014` | Pistes de jauges, zones désactivées |
| `ink` | `#13202a` | `#e9eff2` | Texte principal et valeurs |
| `ink-muted` | `#475763` | `#a3b3bc` | Libellés, unités |
| `line` | `#d3dcdf` | `#26343c` | Séparateurs décoratifs |
| `line-strong` | `#66777f` | `#7d8f98` | Bordures des contrôles |
| `sun` | `#f2b705` | `#f5c431` | Marque, flux de production (aplats) |
| `sun-strong` | `#a87e00` | `#f5c431` | Courbe de production dans les graphiques |
| `on-sun` | `#13202a` | `#13202a` | Texte sur `sun` |
| `primary` | `#0b6e69` | `#43c4b6` | Action principale, flux vers la batterie |
| `on-primary` | `#ffffff` | `#06201e` | Texte sur `primary` |
| `grid` | `#2f5fd0` | `#86a8ff` | Flux vers le réseau |
| `status-normal` | `#1d7445` | `#58c98f` | État normal |
| `status-warning` | `#a84a07` | `#f5a04a` | Avertissement |
| `status-critical` | `#b3261e` | `#ff8a7a` | Critique, refus, hors ligne |
| `status-nodata` | `#5f6f78` | `#93a4ad` | Sans données |
| `status-*-soft` | voir le design system | | Fonds de bandeaux et pastilles |
| `focus` | `#2f5fd0` | `#86a8ff` | Anneau de focus |
| `disabled-fill`, `disabled-line` | `#c9d3d8`, `#93a4ad` | `#2a3740`, `#4c5c65` | Contrôles désactivés |
| `map-ground`, `map-field`, `map-path` | | | Fond de carte |
| `scrim` | 55 % d'encre | 60 % de noir | Voile derrière un dialogue |

### Contrastes vérifiés (WCAG 2)

Calculés sur les valeurs ci-dessus. Seuils : 4,5:1 pour le texte, 3:1 pour les bordures, icônes et éléments graphiques.

| Couple | Clair | Sombre |
|---|---|---|
| `ink` / `surface` | 15,4 | 15,7 |
| `ink-muted` / `surface` | 6,9 | 8,5 |
| `line-strong` / `surface-raised` | 4,7 | 4,9 |
| `on-primary` / `primary` | 6,1 | 8,0 |
| `on-sun` / `sun` | 9,1 | 10,1 |
| `status-normal` / `surface-raised` | 5,8 | 7,9 |
| `status-warning` / `surface-raised` | 5,8 | 7,8 |
| `status-critical` / `surface-raised` | 6,5 | 7,2 |
| `status-nodata` / `surface-raised` | 5,2 | 6,4 |
| `ink` / `status-critical-soft` | 13,3 | 13,6 |
| `focus` / `surface-raised` | 5,7 | 7,1 |

Seule exception : `sun` sur `surface` en thème clair (1,7:1). Cette couleur n'est donc jamais utilisée pour du texte, et tout graphique en `sun` est accompagné de sa valeur écrite.

**Fonds d'état clairs (`status-*-soft`) : toujours bordés.** Un fond `-soft` posé sur une carte se distingue à peine (1,15:1 entre `status-warning-soft` et `surface-raised`). Tout bandeau ou pastille sur fond `-soft` porte donc une bordure de 1 px dans sa couleur d'état, qui dépasse 3:1 dans les deux thèmes (`status-warning` : 5,8:1 en clair, 7,8:1 en sombre).

## 3. Typographie

[D016](../journal/decisions/D016-typographie-red-hat.md) : famille **Red Hat** (licence SIL Open Font), fichiers embarqués dans l'app.

| Style | Famille | Taille / interligne | Graisse | Usage |
|---|---|---|---|---|
| `title` | Red Hat Display | 24 / 30 | 700 | Titre d'écran |
| `heading` | Red Hat Display | 18 / 24 | 600 | Titre de carte |
| `body` | Red Hat Text | 16 / 24 | 400 | Texte courant |
| `label` | Red Hat Text | 14 / 20 | 500 | Libellés, boutons |
| `caption` | Red Hat Text | 13 / 18 | 400 | Ancienneté, mentions secondaires |
| `metric-xl` | Red Hat Mono | 40 / 44 | 600 | Valeur principale |
| `metric` | Red Hat Mono | 22 / 28 | 500 | Valeurs secondaires |

Les valeurs chiffrées sont en Red Hat Mono pour que les chiffres ne bougent pas quand ils changent. L'app respecte la taille de police choisie dans les réglages du téléphone.

## 4. Espacements, formes, icônes

- Espacements : 4, 8, 12, 16, 24, 32 px (`space-1` à `space-8`). Marges d'écran 16 px, écart entre cartes 16 à 24 px.
- Rayons : 6 px (pastilles, champs), 12 px (cartes, boutons), 20 px (dialogues, carte du parc).
- Pas d'ombre portée : les cartes se détachent par leur fond.
- Icônes : **Phosphor**, graisse « regular », 24 px ([D017](../journal/decisions/D017-icones-phosphor.md)). La correspondance usage → icône est dans le design system.

## 5. Format des textes

- Français, phrases courtes, sans point d'exclamation ni emoji.
- Nombres au format français : virgule décimale, espace insécable avant l'unité (« 3,15 kW », « 63 % »).
- Boutons : verbe à l'infinitif (« Appliquer ») ; résultat au participe (« Appliquée »).

## 6. Maquettes

Toutes les maquettes sont au format téléphone (390 × 844 px), en français, avec les données de démonstration du modèle de données.

| Rangée | Écrans |
|---|---|
| Écrans principaux | Supervision, Carte, Pilotage, Alertes, Détail d'un panneau, Connexion, Carte en vue Liste avec les panneaux à positionner ([D020](../journal/decisions/D020-inventaire-des-panneaux.md), réglage « placement » pour la feuille de positionnement) |
| Envoi d'une consigne | Confirmation, attente de l'objet, résultat (appliquée, appliquée en partie, refusée) |
| États particuliers | Téléphone hors ligne, objet hors ligne, rôle lecteur, chargement, aucune alerte, erreur de connexion |
| Thème sombre | Les six écrans principaux en thème sombre |
| Composant partagé | Barre d'onglets |

Sur le canevas, chaque écran a un réglage **Clair / Sombre** (onglet Tweaks). L'écran Pilotage a un réglage d'état qui affiche ses huit variantes ; Supervision, Alertes et Connexion ont aussi le leur. Les écrans principaux sont reliés entre eux : le mode Lecture permet de naviguer par la barre d'onglets.

Chaque élément affiché correspond à un champ de l'API (section 7.3 de la [cartographie technique](03-cartographie-technique.md)).

### Thème de l'app

L'app suit le réglage clair ou sombre du téléphone. Les couleurs sont définies une seule fois, à partir de `tokens.json`, dans `apps/mobile/src/theme/` (deux jeux de valeurs, mêmes noms de jetons).

### Marqueur « Nouvelle » (écran Alertes)

Dans l'onglet « Actives », une alerte non lue ([D034](../journal/decisions/D034-alertes-lues-par-telephone.md)) porte, sur la ligne de sa gravité, un **point plein** (8 px, couleur `ink`) suivi du mot **« Nouvelle »** (style `labelBold`, couleur `ink`). Une alerte lue n'a ni point ni mot. L'information ne passe jamais par la couleur seule : le point et le mot sont présents, et le libellé d'accessibilité de l'alerte ajoute « non lue ». La couleur de gravité (`status-*`) reste réservée à la gravité.

Une alerte de panneau a, sous son texte, un contrôle **« Voir le panneau »** (icône `CaretRight`, couleur `primary`, hauteur d'au moins 48 px) ; une alerte du site n'a pas de navigation. Le bouton secondaire **« Tout marquer comme lu »** est à droite du titre de l'écran tant qu'il existe des alertes non lues.

### Bandeau d'alerte (app ouverte)

Quand une nouvelle alerte s'ouvre alors que l'app est au premier plan, aucune notification système n'est affichée ([D033](../journal/decisions/D033-regles-envoi-notifications-alerte.md)) : un bandeau la remplace ([#108](04-besoins-fonctionnels.md)).

- **Place** : en haut de l'écran, sous la barre d'état, par-dessus le contenu, marges latérales de 16 px ; sur tous les écrans sauf Alertes, dont la liste suffit.
- **Contenu, une alerte** : icône de gravité (`Warning` ou `WarningOctagon`, couleur `status-*`), libellé de gravité en `bodyBold` (« Avertissement », « Critique »), texte de l'alerte en `label` (le même que la notification push, trois lignes au plus), puis le bouton texte **« Voir »** (`bodyBold`, couleur `primary`) et le bouton **Fermer** (icône `X`, couleur `ink`, `accessibilityLabel` « Fermer »). Les deux boutons font au moins 48 × 48 px.
- **Plusieurs alertes au même rafraîchissement** : un seul bandeau « N nouvelles alertes », avec l'icône de la gravité la plus haute et sans texte ; « Voir » ouvre l'écran Alertes.
- **Couleurs** : fond `status-*-soft` et bordure `status-*` de la gravité, comme les autres bandeaux ; texte `ink`. Uniquement des jetons, en clair comme en sombre. La gravité est toujours portée par l'icône et le libellé, jamais par la couleur seule.
- **Comportement** : disparition seule après 8 s (`ALERT_BANNER_DURATION_MS`), ou à la fermeture ; « Voir » ouvre le détail du panneau ou l'écran Alertes, sans marquer l'alerte comme lue. Le bandeau est annoncé au lecteur d'écran (« Nouvelle alerte, Critique : … »).
- **Quand il n'apparaît pas** : au premier chargement et pour les alertes déjà présentes à l'ouverture de l'app, pour une alerte déjà lue (D034), pour une alerte `info` et pour les types de `PUSH_EXCLUDED_ALERT_TYPES` (consigne refusée), comme le push.

### Section « Objets » (exploitant)

Écran `app/devices.tsx` ([#82](04-besoins-fonctionnels.md), [D027](../journal/decisions/D027-certificat-objet-et-enrolement.md)) : l'exploitant compare l'empreinte de la clé d'un objet, accepte ou refuse sa demande, et révoque un objet volé.

- **Accès** : depuis Supervision, une carte-lien « Objets du site » (icône `Lock`, `CaretRight`), visible du seul exploitant. Tant qu'une demande attend, la carte est en haut de l'écran, fond `status-warning-soft` bordé de `status-warning`, texte « 1 demande à comparer et accepter » ; sinon elle est en bas, fond `surfaceRaised`, texte « Certificats et révocation ». Elle reste visible quand l'objet n'a encore envoyé aucune mesure : sans certificat, il n'en enverra pas.
- **En-tête** : titre « Objets », sous-titre « Certificats des objets du site », retour « Supervision » (`CaretLeft`, `primary`).
- **Demandes en attente** : une carte par demande, avec le nom de l'objet en `bodyBold`, la pastille « En attente » (`status-warning`, icône `Clock`), « Demande reçue à 10:02 · expire à 10:32 » en `label` `inkMuted`, l'intitulé « Empreinte de la clé », l'**empreinte complète** puis l'invitation « Comparez-la caractère par caractère avec l'empreinte affichée sur le moniteur série de l'objet. Acceptez seulement si elles sont identiques. ». Boutons « Refuser » (secondaire) et « Accepter » (principal), côte à côte.
- **Empreinte** : les 64 caractères hexadécimaux **en minuscules**, en groupes de 4 séparés par une espace, 4 groupes par ligne (4 lignes), en Red Hat Mono (`value`), sur fond `surfaceSunken`. Le firmware l'affiche au même format sur le moniteur série (#83). Le lecteur d'écran l'épelle : « Empreinte de la clé : 3 f a 9, 4 c 0 e, … ».
- **Confirmation de l'acceptation** (feuille du bas) : titre « Accepter device-site01 ? », rappel « Acceptez seulement si cette empreinte est identique à celle du moniteur série de l'objet. », l'empreinte de nouveau, « Durée du certificat » avec un sélecteur `8 h` (défaut), `24 h`, `1 semaine`, puis « Annuler » et « Accepter ».
- **Objets actifs** : une carte par objet, avec le nom, la pastille « Certificat actif » (`status-normal`, `CheckCircle`), « Valable jusqu'au 27 nov., 15:04 · accepté par Exploitant », l'empreinte, et le bouton secondaire « Révoquer ».
- **Confirmation de la révocation** (feuille du bas) : titre « Révoquer device-site01 ? », texte « L'objet perd aussitôt ses droits sur le broker et ne pourra plus se reconnecter avec ce certificat. C'est définitif : pour revenir, il devra refaire une demande. », puis « Annuler » et « Révoquer ».
- **États** : chargement (« Chargement des objets… ») ; aucune demande (« Aucune demande en attente. Un objet qui démarre sans certificat apparaît ici. ») ; aucun objet actif ; erreur de chargement (bandeau `critical` « Objets indisponibles ») ; action refusée (bandeau `critical` « Action impossible » avec le message de l'API) ; broker non rechargé (bandeau `warning` « Décision enregistrée ») ; hors ligne (bandeau habituel, boutons désactivés) ; **lecteur** : bandeau `neutral` « Réservé aux exploitants » (icône `Lock`), aucune demande ni aucun bouton.

### Ajout d'un panneau sur le terrain (bonus #63)

Écran `app/panel/new.tsx`, ouvert par le bouton secondaire « Ajouter un panneau » (icône `MapPin`) de l'écran Carte, visible du seul exploitant.

- **En-tête** : titre « Ajouter un panneau », retour « Carte ».
- **1. Code du panneau** : aperçu de la caméra (carré, coins arrondis `radius.md`) avec la phrase « Visez le QR code collé sur le panneau. » ; une fois lu, le code s'affiche en `metric` avec la pastille « Code lu » (`status-normal`). Le bouton « Saisir le code à la main » ouvre un champ (« Code du panneau », exemple `P21`).
- **2. Position** : bouton « Utiliser ma position » (principal tant qu'aucune position n'est prise), puis « Position du téléphone : 47,250 12, -1,549 87 (précision 4 m) ». « Saisir les coordonnées » ouvre deux champs (latitude, longitude).
- **3. Description** : « Nom » (facultatif, « Panneau P21 » par défaut) et « Puissance nominale (W) » (200 par défaut).
- **Bouton principal** « Ajouter le panneau », actif quand le code et la position sont connus.
- **Refus de la caméra** : bandeau `neutral` « Caméra non autorisée » : « La caméra sert à lire le QR code du panneau sans erreur de saisie. Vous pouvez saisir le code à la main, ou l'autoriser dans les réglages du téléphone. » et le champ de saisie ouvert.
- **Refus de la localisation** : bandeau `neutral` « Localisation non autorisée » : « La position du téléphone place le panneau sur la carte. Vous pouvez saisir ses coordonnées, ou l'autoriser dans les réglages. » et les deux champs ouverts.
- **Erreurs** : code déjà présent (« Un panneau P21 existe déjà sur ce site. Placez-le depuis la liste « à positionner » s'il vient d'être détecté. »), code invalide, hors ligne (bouton désactivé). **Lecteur** : bandeau « Réservé aux exploitants », aucun champ.

### Graphique de courbe (lecture d'une valeur)

Le graphique de production (écran Supervision, détail d'un panneau) se lit au toucher ([#106](04-besoins-fonctionnels.md)) :

- **Appui ou glissement** sur la zone de tracé : un **trait vertical** (`lineStrong`) se place au point le plus proche de la courbe réelle, ce point est mis en valeur (disque `ink` bordé de `surface`), et une **bulle** (fond `surfaceRaised`, bordure `lineStrong`, texte `ink`) affiche l'heure complète (`14:35` sur 1 h et 24 h, `lun. 23 · 14:35` sur 7 jours), « Réelle : X » et, si la courbe attendue existe, « Attendue : Y ». La bulle reste dans les bords du graphique.
- **Relâchement** : la sélection reste affichée 1,5 s puis disparaît ; un nouvel appui la replace aussitôt. Le geste n'est pris que s'il est plutôt horizontal : un glissement vertical fait défiler l'écran.
- **Axe du temps** selon la période : `HH:MM` sur 1 h, `HH h` sur 24 h, jour abrégé et date (`lun. 23`) sur 7 jours.
- **Sans donnée** (aucune mesure ou une seule sur la période) : à la place de la zone vide, une phrase en `inkMuted` (« Aucune mesure sur la dernière heure », « … sur les dernières 24 heures », « … sur les 7 derniers jours »).
- Le résumé d'accessibilité du graphique (valeur actuelle, maximum) est conservé ; la valeur lue au toucher est un complément visuel.

## 7. Écarts et points ouverts

- Le design system ne contient pas encore de composants réutilisables (boutons, pastilles, cartes) : ils seront écrits directement en React Native à partir des jetons.
- Les maquettes ont été validées par le binôme le 6 novembre 2026 (critère de l'issue #2).
- L'écran Alertes montre le marqueur « Nouvelle », le contrôle « Voir le panneau » et le bouton « Tout marquer comme lu » ([D034](../journal/decisions/D034-alertes-lues-par-telephone.md)). La maquette (canevas hors du dépôt) a été mise à jour le 2026-11-26 : écran Alertes, thème sombre compris, et état « Alertes · toutes lues ».
- Le bandeau d'alerte app ouverte (#108) est décrit ci-dessus, mais **pas encore dessiné sur le canevas** (clair et sombre, une alerte et plusieurs alertes) : la maquette reste à ajouter.
- L'écran d'ajout d'un panneau (#63) est décrit ci-dessus, mais **pas encore dessiné sur le canevas** : la maquette reste à ajouter.
- La section « Objets » (#82) est décrite ci-dessus et réalisée avec les jetons des deux thèmes, mais **pas encore dessinée sur le canevas** (demandes, objets actifs, confirmations, lecteur, clair et sombre) : la maquette reste à ajouter et à faire valider par le binôme.
