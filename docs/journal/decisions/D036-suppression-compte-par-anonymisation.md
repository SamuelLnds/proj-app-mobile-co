# D036 · Suppression d'un compte par anonymisation

| | |
|---|---|
| **Date** | 2026-11-27 |
| **Statut** | Proposée (à valider par le binôme à la relecture de #51) |
| **Décideurs** | Le binôme |
| **Liens** | Issue [#51](https://github.com/SamuelLnds/proj-app-mobile-co/issues/51) · [Dossier sécurité, section 6](../../dossier-securite.md) · [Modèle de données, `setpoints` et `device_enrollments`](../../conception/01-modele-donnees.md) |

## Contexte

Le RGPD demande de pouvoir supprimer les données personnelles d'un utilisateur. Or l'historique des consignes garde son auteur (`setpoints.author_id`, `ON DELETE RESTRICT`) : c'est ce qui permet de savoir qui a piloté la batterie. Supprimer la ligne d'un utilisateur qui a envoyé des consignes est donc refusé par la base.

## Options étudiées

| Critère | Suppression avec ses consignes (`CASCADE`) | Auteur mis à `NULL` | Anonymisation du compte (retenue) |
|---|---|---|---|
| Données personnelles effacées | Oui | Oui | Oui (e-mail, nom, mot de passe, jetons push) |
| Traçabilité du pilotage | Perdue : l'historique a des trous | Perdue : « auteur inconnu » | Gardée : les consignes restent liées à un compte « Compte supprimé » |
| Changement du modèle de données | Oui | Oui (`author_id` nullable, schémas des contrats) | Non |
| Mise en œuvre | Migration | Migration et contrats | Une procédure SQL documentée |

## Décision

Un compte est supprimé par **anonymisation** : e-mail remplacé par une adresse invalide unique, nom « Compte supprimé », haché du mot de passe remplacé par une valeur qui ne correspond à aucun mot de passe, rôle `viewer`, jetons push supprimés. Un compte qui n'a jamais envoyé de consigne peut être supprimé directement. La procédure est écrite dans le dossier sécurité ; elle est exécutée par l'administrateur du serveur, sans route dans l'API.

## Justification

L'historique des consignes est une mesure de sûreté (qui a demandé quoi, et quand) : le garder sous un compte anonyme concilie traçabilité et effacement des données personnelles, sans toucher au modèle ni aux contrats. Le nombre de comptes (un binôme, des comptes de démonstration) ne justifie pas une route d'administration.

## Conséquences

- Aucune migration ni route ; procédure SQL dans `docs/dossier-securite.md`.
- Un jeton d'accès déjà émis reste valable jusqu'à son expiration (8 h au plus), limite notée dans le dossier sécurité.
- Pour une vraie exploitation, une route d'administration (rôle dédié) ferait la même opération.

## Sources

- [RGPD, article 17](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679) : droit à l'effacement
- [CNIL, anonymisation](https://www.cnil.fr/fr/technologies/lanonymisation-de-donnees-personnelles)
