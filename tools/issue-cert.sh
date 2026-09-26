#!/usr/bin/env bash
# Issue (or re-issue) the free Let's Encrypt certificate that GitHub Pages
# provisions for the custom domain, then switch on Enforce HTTPS.
#
#   ./tools/issue-cert.sh              # check DNS, restart the order, wait, enforce HTTPS
#   ./tools/issue-cert.sh --status     # only show the current state
#   ./tools/issue-cert.sh --no-retry   # do not re-apply the domain, just wait
#
# Requires: gh (GitHub CLI) authenticated as the repository owner, dig, openssl.
# GitHub Pages does not accept an uploaded certificate - it orders one from
# Let's Encrypt itself, so "issuing" means: correct DNS + (re)apply the domain.
set -uo pipefail

REPO="${REPO:-Pashawilliams/site}"
DOMAIN="${DOMAIN:-eurotour.pp.ua}"
PAGES_IPS=(185.199.108.153 185.199.109.153 185.199.110.153 185.199.111.153)
RETRY=1

for a in "$@"; do
  case "$a" in
    --status) gh api "repos/$REPO/pages" --jq '{cname:.cname,state:.https_certificate.state,desc:.https_certificate.description,domains:.https_certificate.domains,enforced:.https_enforced,url:.html_url}'; exit 0;;
    --no-retry) RETRY=0;;
    -h|--help) sed -n '2,12p' "$0"; exit 0;;
  esac
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }

command -v gh  >/dev/null || fail "gh (GitHub CLI) is required: https://cli.github.com"
command -v dig >/dev/null || fail "dig is required (dnsutils / bind-utils)"
gh auth status >/dev/null 2>&1 || fail "run 'gh auth login' first"

say "1. DNS for $DOMAIN"
A=$(dig +short "$DOMAIN" A | sort | tr '\n' ' ')
echo "   A      : ${A:-<none>}"
BAD=0
for ip in "${PAGES_IPS[@]}"; do
  [[ " $A " == *" $ip "* ]] || { warn "missing GitHub Pages A record $ip"; BAD=1; }
done
for ip in $A; do
  [[ " ${PAGES_IPS[*]} " == *" $ip "* ]] || { warn "foreign A record $ip - remove it, Let's Encrypt validation fails because of it"; BAD=1; }
done

AAAA=$(dig +short "$DOMAIN" AAAA | tr '\n' ' ')
[ -n "$AAAA" ] && { echo "   AAAA   : $AAAA"; warn "unexpected AAAA records - keep only GitHub Pages IPv6 (2606:50c0:8000::153 …) or none"; }

WWW=$(dig +short "www.$DOMAIN" CNAME | tr '\n' ' ')
echo "   www    : ${WWW:-<none>}"
[ -n "$WWW" ] || warn "www.$DOMAIN has no CNAME to <user>.github.io. - the certificate will cover the apex only"

CAA=$(dig +short "$DOMAIN" CAA; dig +short "${DOMAIN#*.}" CAA)
if [ -n "$CAA" ] && ! grep -qi letsencrypt.org <<<"$CAA"; then
  echo "   CAA    : $CAA"
  warn "CAA records do not allow letsencrypt.org - add: 0 issue \"letsencrypt.org\""
  BAD=1
fi
[ "$BAD" = 0 ] && ok "DNS looks correct" || fail "fix DNS at your registrar (NIC.UA) and run this script again"

say "2. Current Pages state"
gh api "repos/$REPO/pages" --jq '{cname:.cname,state:.https_certificate.state,enforced:.https_enforced}' || fail "cannot read Pages settings (token needs the classic 'repo' scope)"

if [ "$RETRY" = 1 ]; then
  say "3. Re-applying the custom domain (restarts the ACME order)"
  gh api -X PUT "repos/$REPO/pages" -f cname="" >/dev/null 2>&1 || warn "could not clear the domain - continuing"
  sleep 10
  gh api -X PUT "repos/$REPO/pages" -f cname="$DOMAIN" >/dev/null || fail "could not set the custom domain (403 = token lacks 'repo'/admin rights)"
  ok "domain re-applied, GitHub ordered a new certificate from Let's Encrypt"
fi

say "4. Waiting for the certificate (up to 30 min)"
STATE=""
for i in $(seq 1 60); do
  STATE=$(gh api "repos/$REPO/pages" --jq '.https_certificate.state' 2>/dev/null)
  printf '\r   [%02d/60] state=%-22s' "$i" "$STATE"
  case "$STATE" in
    approved) echo; ok "certificate issued"; break;;
    errored|bad_authz|destroy_pending) echo; fail "certificate state: $STATE - check DNS and retry";;
  esac
  sleep 30
done
echo

if [ "$STATE" = approved ]; then
  say "5. Enforcing HTTPS"
  gh api -X PUT "repos/$REPO/pages" -F https_enforced=true >/dev/null && ok "Enforce HTTPS is on"
else
  warn "still '$STATE' - DNS propagation can take longer; re-run './tools/issue-cert.sh --no-retry' later"
fi

say "6. Verification"
gh api "repos/$REPO/pages" --jq '{state:.https_certificate.state,domains:.https_certificate.domains,enforced:.https_enforced,url:.html_url}'
curl -sSI --max-time 20 "https://$DOMAIN/" | head -1
echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates 2>/dev/null
