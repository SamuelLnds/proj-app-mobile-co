#!/bin/sh
# Recharge l'ACL des objets et la liste de révocation, sans couper le broker (D027).
# Exécuté dans le conteneur mqtt : docker compose -f infra/docker-compose.yml exec -T mqtt sh /src/config/reload.sh
# L'API écrit les fichiers dans infra/mosquitto/devices/ (monté en lecture seule sur /src/devices) ;
# ils sont recopiés avec les permissions exigées par Mosquitto, puis SIGHUP les fait relire.
set -e
cp /src/devices/acl /etc/mosquitto-solar/devices.acl
cp /src/devices/crl.pem /etc/mosquitto-solar/devices.crl
chown mosquitto:mosquitto /etc/mosquitto-solar/devices.acl /etc/mosquitto-solar/devices.crl
chmod 0600 /etc/mosquitto-solar/devices.acl /etc/mosquitto-solar/devices.crl
# Mosquitto est le processus 1 du conteneur (exec dans la commande de démarrage)
kill -HUP 1
