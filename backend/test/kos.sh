#!/usr/bin/env bash
#
# Butun yerel denemeleri tek komutla kosar:  cd backend && npm test
#
# Her betik BOS bir veritabaninda calisir — 14 Eylul 2026'da ayni betik
# ust uste kosulunca "ikinci fatura acildi" diye yaniltici KALDI verdi;
# onceki kosunun artigiydi. Bu yuzden her betikten once tablolar bosaltilir.
#
# Gerekenler: Docker (yerel MySQL kabi icin) ve internet (Harem kuru testi
# gercek akisa baglanir; internet yoksa o betik kalir, digerleri etkilenmez).
#
# Ortam:
#   ERP_TEST_PORT   yerel MySQL portu (varsayilan 3399)
#   ERP_TEST_API    backend portu   (varsayilan 3000)
#   SADECE=<ad>     yalnizca adi bu dizgiyi iceren betikleri kos
#                   ornek: SADECE=katman npm test
#
# Sunucuda DEGIL, gelistirici makinesinde calisir. Canliya dokunmaz:
# DATABASE_URL burada 127.0.0.1'e sabitlenir, disaridan gelen deger ezilir.
set -u

cd "$(dirname "$0")/.." || exit 1

MYSQL_PORT="${ERP_TEST_PORT:-3399}"
API_PORT="${ERP_TEST_API:-3000}"
KAP="erp-test-mysql"
export DATABASE_URL="mysql://root:test@127.0.0.1:${MYSQL_PORT}/teknikerp"
export ADMIN_USERNAME=admin ADMIN_PASSWORD=test JWT_SECRET=yerel-deneme
export KUR_FARKI="${KUR_FARKI:-0.20}"
# Canliyla ayni saat dilimi — gun sinirlari (anasayfa "bugun") buna bagli.
# Git Bash bunu Windows sureclerine GECIRMEZ; orada makinenin kendi saat
# dilimi gecerlidir (Turkiye'de zaten UTC+3). Linux'ta calisir.
export TZ=Europe/Istanbul
export PORT="$API_PORT" TEST_API="http://127.0.0.1:${API_PORT}"

# Betik listesi: ad, backend gerekiyor mu
# (backend gerektirenler gercek uc uzerinden calisir)
BETIKLER=(
  "excel-baslik-test:hayir"
  "excel-kod-test:hayir"
  "excel-lot-test:hayir"
  "fifo-test-kur:hayir"
  "excel-onkontrol-test:evet"
  "excel-arkaplan-test:evet"
  "elle-stok-katman-test:evet"
  "kasa-hareket-test:evet"
  "anasayfa-f2-test:evet"
  "musteri-kodu-test:evet"
  "on-siparis-test:evet"
  "rapor-test:evet"
  "on-siparis-rapor-test:evet"
  "duzeltmeler-test:evet"
  "fis-kur-test:evet"
  "harem-kur-test:evet"
)

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ── MySQL kabi ─────────────────────────────────────────────────────────
if ! docker info >/dev/null 2>&1; then
  echo "HATA: Docker calismiyor. Docker Desktop'i acip tekrar dene." >&2
  exit 2
fi
if [ -z "$(docker ps -q -f name="^${KAP}$")" ]; then
  log "MySQL kabi baslatiliyor ($KAP, port $MYSQL_PORT)"
  docker rm -f "$KAP" >/dev/null 2>&1
  docker run -d --name "$KAP" -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=teknikerp \
    -p "${MYSQL_PORT}:3306" mysql:8.0 >/dev/null || exit 2
  for _ in $(seq 1 60); do
    docker exec "$KAP" mysqladmin -uroot -ptest ping 2>/dev/null | grep -q alive && break
    sleep 2
  done
fi

log "Sema yukleniyor"
npx prisma db push --url "$DATABASE_URL" --accept-data-loss >/dev/null 2>&1 || {
  echo "HATA: prisma db push basarisiz" >&2; exit 2; }

# Tablolari bosalt — veritabanini DROP etmiyoruz, backend'in acik
# baglantilari kopmasin
tablolari_bosalt() {
  docker exec "$KAP" sh -c 'mysql -uroot -ptest -N -e "SELECT CONCAT(\"TRUNCATE TABLE \`\", table_name, \"\`;\") FROM information_schema.tables WHERE table_schema=\"teknikerp\" AND table_name NOT LIKE \"\\_prisma%\"" 2>/dev/null | mysql -uroot -ptest teknikerp --init-command="SET FOREIGN_KEY_CHECKS=0" 2>/dev/null'
}

# ── Backend ────────────────────────────────────────────────────────────
BACKEND_PID=""
BACKEND_LOG="$(mktemp)"
# Portu dinleyen sureclerin PID'leri (Windows ve Linux)
port_pidleri() {
  if command -v netstat >/dev/null 2>&1 && [ "$(uname -s | cut -c1-5)" = "MINGW" ]; then
    netstat -ano 2>/dev/null | awk -v p=":${API_PORT}" '$2 ~ p"$" && $4=="LISTENING" {print $5}' | sort -u
  else
    lsof -tiTCP:"$API_PORT" -sTCP:LISTEN 2>/dev/null
  fi
}
backend_baslat() {
  # 14 Eylul 2026: port dolu kalmis eski bir backend'e karsi test kosuldu,
  # yeni uc 404 verdi. Dolu porta ASLA baslama — yanlis sunucuya karsi
  # gecen test, gecmemis testten kotudur.
  local dolu; dolu="$(port_pidleri)"
  if [ -n "$dolu" ]; then
    echo "HATA: port $API_PORT dolu (PID: $(echo "$dolu" | xargs)). Eski bir backend calisiyor; kapat ve tekrar dene." >&2
    return 1
  fi
  log "Backend baslatiliyor (port $API_PORT, KUR_FARKI=$KUR_FARKI)"
  npx tsx src/index.ts >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "http://127.0.0.1:${API_PORT}/api/auth/login" && return 0
    sleep 1
  done
  echo "HATA: backend acilmadi. Log:" >&2; tail -20 "$BACKEND_LOG" >&2
  return 1
}
backend_kapat() {
  [ -n "$BACKEND_PID" ] || return 0
  # Once surec agaci, sonra portu hala tutan ne varsa — Windows'ta npx ->
  # node zinciri agac olarak gorunmeyebiliyor, port uzerinden de kapat
  if command -v taskkill >/dev/null 2>&1; then
    taskkill //PID "$BACKEND_PID" //T //F >/dev/null 2>&1
    for p in $(port_pidleri); do taskkill //PID "$p" //T //F >/dev/null 2>&1; done
  else
    kill "$BACKEND_PID" 2>/dev/null
    for p in $(port_pidleri); do kill "$p" 2>/dev/null; done
  fi
  BACKEND_PID=""
}
trap 'backend_kapat; rm -f "$BACKEND_LOG"' EXIT

# ── Kosu ───────────────────────────────────────────────────────────────
GECEN=0; KALAN=0; KALANLAR=""
for satir in "${BETIKLER[@]}"; do
  ad="${satir%%:*}"; backend="${satir##*:}"
  if [ -n "${SADECE:-}" ] && [[ "$ad" != *"$SADECE"* ]]; then continue; fi

  log "$ad"
  tablolari_bosalt
  if [ "$backend" = "evet" ] && [ -z "$BACKEND_PID" ]; then
    backend_baslat || { KALAN=$((KALAN+1)); KALANLAR="$KALANLAR $ad"; continue; }
  fi

  if npx tsx "prisma/${ad}.ts"; then
    GECEN=$((GECEN+1))
  else
    KALAN=$((KALAN+1)); KALANLAR="$KALANLAR $ad"
  fi
done

backend_kapat
echo
echo "================================================"
echo "  GECEN: $GECEN   KALAN: $KALAN"
[ "$KALAN" -eq 0 ] || echo "  Kalanlar:$KALANLAR"
echo "================================================"
[ "$KALAN" -eq 0 ]
