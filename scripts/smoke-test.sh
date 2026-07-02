#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  Bella Shop - Smoke Test                                     ║
# ╚══════════════════════════════════════════════════════════════╝
#
# Prüft die wichtigsten Endpoints der Bestellseite. Nutze nach
# jedem Deploy, um sicher zu sein dass nichts kaputt ist.
#
# Verwendung:
#   ./scripts/smoke-test.sh                          # gegen Live-Seite
#   ./scripts/smoke-test.sh <URL>                    # gegen anderen Host
#   ./scripts/smoke-test.sh test                     # gegen aktuellen Test-Channel
#
# Beispiele:
#   ./scripts/smoke-test.sh test
#   ./scripts/smoke-test.sh https://fliegengitter-bestellung--test-47x5suqw.web.app
#
# Exit-Code 0 = alles grün, 1 = mindestens ein Test fehlgeschlagen.

set -u

LIVE_URL="https://fliegengitterwien.at"
TEST_URL="https://bestellung-fliegengitterwien.web.app"
LEGACY_SUBDOMAIN="https://bestellung.fliegengitterwien.at"  # Subdomain, wird später entfernt
LEGACY_URL="https://fliegengitter-bestellung.web.app"       # Sehr alte URL, wird entfernt

# Eine echte Bestellung zum End-to-End-Lookup-Test.
# Ändern wenn diese Bestellung archiviert wird oder andere Test-Daten gewünscht.
LOOKUP_ORDER_NUMBER="#2026-00369"
LOOKUP_EMAIL="h.lafci@gmx.net"

# ── URL parsen ────────────────────────────────────────────────────
case "${1:-live}" in
  live|"") BASE="$LIVE_URL" ;;
  test)    BASE="$TEST_URL" ;;
  http*)   BASE="$1" ;;
  *)       BASE="$1" ;;
esac

# ── Farben (nur wenn Terminal) ────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; BOLD='\033[1m'; NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BOLD=''; NC=''
fi

PASS=0
FAIL=0
FAILED_TESTS=()

# Einzelnen Test ausführen.
# Args: name, method, path, expected_http_code, json_check (optional jq-Filter, muss true ergeben)
run() {
  local name="$1" method="$2" path="$3" expected="$4" jq_check="${5:-}" body="${6:-}"
  local url="$BASE$path"
  local tmpf; tmpf=$(mktemp)
  local code
  if [[ -n "$body" ]]; then
    code=$(curl -s -o "$tmpf" -w "%{http_code}" -X "$method" -H 'Content-Type: application/json' -d "$body" "$url" || echo "000")
  else
    code=$(curl -s -o "$tmpf" -w "%{http_code}" -X "$method" "$url" || echo "000")
  fi

  if [[ "$code" != "$expected" ]]; then
    echo -e "  ${RED}✗${NC} $name  ${YELLOW}(HTTP $code, erwartet $expected)${NC}"
    echo "      $(head -c 200 "$tmpf")"
    FAIL=$((FAIL+1)); FAILED_TESTS+=("$name")
    rm -f "$tmpf"; return 1
  fi

  if [[ -n "$jq_check" ]]; then
    if ! command -v jq >/dev/null 2>&1; then
      echo -e "  ${YELLOW}⚠${NC} $name  (HTTP $code, jq fehlt → kein JSON-Check)"
      PASS=$((PASS+1)); rm -f "$tmpf"; return 0
    fi
    if ! jq -e "$jq_check" "$tmpf" >/dev/null 2>&1; then
      echo -e "  ${RED}✗${NC} $name  ${YELLOW}(HTTP $code OK, aber Inhalt unerwartet)${NC}"
      echo "      $(head -c 200 "$tmpf")"
      FAIL=$((FAIL+1)); FAILED_TESTS+=("$name")
      rm -f "$tmpf"; return 1
    fi
  fi

  echo -e "  ${GREEN}✓${NC} $name  (HTTP $code)"
  PASS=$((PASS+1)); rm -f "$tmpf"; return 0
}

echo -e "${BOLD}Bella Shop · Smoke Test${NC}"
echo "Target: $BASE"
echo ""

echo "▶ Hosting"
run "Homepage lädt"          GET "/"                "200"
run "Bestellung-Seite lädt"  GET "/#/bestellung"    "200"

echo ""
echo "▶ API · Public Endpoints"
run "GET /api/health"        GET "/api/health"      "200" '.ok == true'
run "GET /api/models"        GET "/api/models"      "200" '.models | type == "array"'
run "GET /api/colors"        GET "/api/colors"      "200" '.colors | type == "array" and length > 0'
run "GET /api/variants"      GET "/api/variants"    "200" '.variants | type == "array" and length > 0'

echo ""
echo "▶ API · Order Lookup (Test-Bestellung $LOOKUP_ORDER_NUMBER)"
LOOKUP_BODY="{\"orderNumber\":\"$LOOKUP_ORDER_NUMBER\",\"email\":\"$LOOKUP_EMAIL\"}"
run "POST /api/orders/lookup → 200 + Token" \
    POST "/api/orders/lookup" "200" '.trackingToken | type == "string" and length > 16' "$LOOKUP_BODY"

# Falls Lookup geklappt hat, mit dem Token den Track-Endpoint testen.
if command -v jq >/dev/null 2>&1; then
  TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d "$LOOKUP_BODY" "$BASE/api/orders/lookup" | jq -r '.trackingToken // empty')
  if [[ -n "$TOKEN" ]]; then
    run "GET /api/orders/track/<token>" GET "/api/orders/track/$TOKEN" "200" '.orderNumber'
  fi
fi

echo ""
echo "▶ API · Negativtests (sollen fehlschlagen)"
run "Lookup ohne Body → 400"  POST "/api/orders/lookup" "400" '' '{}'
run "Lookup mit falscher Email → 404" POST "/api/orders/lookup" "404" '' \
    "{\"orderNumber\":\"$LOOKUP_ORDER_NUMBER\",\"email\":\"nope@example.com\"}"

# ── Zusammenfassung ───────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────"
TOTAL=$((PASS+FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ Alle $TOTAL Tests bestanden${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ $FAIL von $TOTAL Tests fehlgeschlagen${NC}"
  for t in "${FAILED_TESTS[@]}"; do echo "    - $t"; done
  exit 1
fi
