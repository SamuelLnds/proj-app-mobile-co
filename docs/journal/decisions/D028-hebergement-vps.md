# D028 · Hébergement final sur un VPS

| | |
|---|---|
| **Date** | 2026-11-23 |
| **Statut** | Proposée |
| **Décideurs** | À compléter |
| **Liens** | Issues #54 et #65 · [D023](D023-broker-mosquitto-auto-heberge.md) · [D027](D027-certificat-objet-et-enrolement.md) · [Cartographie, sections 2 et 11](../../conception/03-cartographie-technique.md) |

## Contexte

L'hébergement de démonstration était un point ouvert. Trois contraintes le cadrent : l'ESP32 de Wokwi (offre gratuite) ne joint que des services accessibles depuis Internet, donc le broker doit avoir une **adresse publique** ([D023](D023-broker-mosquitto-auto-heberge.md)) ; la base utilise TimescaleDB ; l'enrôlement des objets ([D027](D027-certificat-objet-et-enrolement.md)) demande que l'API soit joignable en HTTPS par l'objet.

## Options étudiées

| Critère | Poste local et tunnel TCP | Offres gérées (API, base, broker séparés) | VPS avec Docker Compose |
|---|---|---|---|
| Adresse publique pour Wokwi | Par le tunnel, dépend d'un service tiers gratuit | Selon l'offre de broker | **Oui**, IP et nom de domaine propres |
| TimescaleDB | Oui | Offre spécialisée nécessaire | Oui (même image qu'en développement) |
| Écart avec le développement | Aucun | Fort (trois fournisseurs) | Faible : le même Docker Compose |
| Disponibilité pour la soutenance | Dépend du poste allumé | Bonne | Bonne |
| Coût | Nul | Variable, offres gratuites limitées | Quelques euros par mois |
| Sécurité à gérer par le binôme | Faible exposition | Déléguée | Pare-feu, SSH, mises à jour : à faire, et utile au dossier sécurité |

## Décision

Tout est hébergé sur **un VPS** : API, base, broker et un proxy HTTPS (Caddy, certificats Let's Encrypt), avec le Docker Compose du projet. L'ESP32 de Wokwi se connecte directement au broker du VPS par son nom de domaine ; le tunnel TCP ne sert qu'avant la mise en place du VPS.

## Justification

C'est la seule option qui donne une adresse publique stable au broker sans service tiers, avec la même pile qu'en développement. Le durcissement du serveur fait partie de la sécurité exigée pour le projet et nourrit le dossier sécurité (#51).

## Conséquences

- Ports ouverts sur Internet : 443 (API en HTTPS, enrôlement compris) et 8883 (MQTT en TLS mutuel) ; SSH par clé uniquement. Les ports 1883 (MQTT local), 3000 (API sans TLS) et 5432 (base) ne sont jamais exposés.
- Le nom de domaine du VPS est ajouté à `MQTT_TLS_HOSTS` ; le firmware embarque le certificat de l'autorité du projet (broker) et la racine publique de Let's Encrypt (API).
- Issue #54 : déployer aussi le broker, configurer pare-feu et SSH, documenter la procédure. Issue #65 : le tunnel devient une solution temporaire.
- Le fournisseur du VPS reste à choisir (cartographie, section 11).
