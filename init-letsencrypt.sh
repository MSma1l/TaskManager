#!/bin/bash
# ============================================================
#  Bootstrap Let's Encrypt (Certbot) pentru nginx în docker-compose
#  Metoda webroot. Se rulează O SINGURĂ DATĂ pe server.
#  Pre-condiții:
#    - DNS: A record pentru taskmanager.sma1lsoft.eu → IP-ul serverului
#    - Porturile 80 și 443 deschise în firewall
#    - docker compose instalat
# ============================================================
set -e

domains=(taskmanager.sma1lsoft.eu)
email="chistol.max2004@gmail.com"
rsa_key_size=4096
staging=0   # pune 1 ca să testezi pe Let's Encrypt STAGING (evită rate-limit-ul); apoi rulează din nou cu 0

compose="docker compose"
cert_path="/etc/letsencrypt/live/${domains[0]}"

echo "### 1/5 Descarc parametrii TLS recomandați ..."
$compose run --rm --entrypoint "\
  sh -c 'mkdir -p /etc/letsencrypt && \
  wget -qO /etc/letsencrypt/options-ssl-nginx.conf https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/src/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf && \
  wget -qO /etc/letsencrypt/ssl-dhparams.pem https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem'" certbot

echo "### 2/5 Creez un certificat temporar (dummy) ca să poată porni nginx ..."
$compose run --rm --entrypoint "\
  sh -c 'mkdir -p ${cert_path} && \
  openssl req -x509 -nodes -newkey rsa:${rsa_key_size} -days 1 \
    -keyout ${cert_path}/privkey.pem -out ${cert_path}/fullchain.pem -subj /CN=localhost'" certbot

echo "### 3/5 Pornesc nginx ..."
$compose up -d nginx
sleep 5

echo "### 4/5 Șterg dummy-ul și cer certificatul real Let's Encrypt ..."
$compose run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/${domains[0]} \
         /etc/letsencrypt/archive/${domains[0]} \
         /etc/letsencrypt/renewal/${domains[0]}.conf" certbot

domain_args=""
for d in "${domains[@]}"; do domain_args="$domain_args -d $d"; done
staging_arg=""; [ "$staging" != "0" ] && staging_arg="--staging"

$compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg --email $email $domain_args \
    --rsa-key-size $rsa_key_size --agree-tos --no-eff-email --force-renewal" certbot

echo "### 5/5 Reîncarc nginx cu certificatul real ..."
$compose exec nginx nginx -s reload

echo ""
echo "✅ GATA. Verifică: https://${domains[0]}"
