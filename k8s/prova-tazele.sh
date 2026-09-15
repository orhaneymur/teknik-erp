#!/bin/bash
#
# Prova ortamini canlinin KOPYASIYLA doldurur.
#
#   bash k8s/prova-tazele.sh shenzhen
#
# Kaynak: tenant-<ad>       (canli)   — yalnizca OKUNUR (mysqldump)
# Hedef : tenant-<ad>-test  (prova)   — icindeki her sey silinir, kopya yuklenir
#
# Hedef adi betigin icinde "-test" sonekiyle kurulur; parametre olarak
# verilemez. Boylece bu betik canliya yazamaz — canli veri korumasi
# (10 Eylul 2026 karari): silme yetenegi koda konmaz.
#
# Ne kopyalanir: butun veritabani (urun, musteri, fatura, kasa, personel).
# Ne kopyalanMAZ: firma adi, logo, kur farki, admin sifresi — bunlar
# ConfigMap/Secret'ta yasar, provanin kendi ayarlari kalir. Fis ustunde
# "Shenzhen Market (TEST)" yazmaya devam eder.
#
# Prova canlidan daha yeni bir surumdeyse: kopya eski semayla gelir,
# sonda backend yeniden baslatilir ve migrate init container'i yeni
# migration'lari uygular.
set -euo pipefail

AD="${1:-}"
if [ -z "$AD" ]; then
  echo "Kullanim: bash k8s/prova-tazele.sh <musteri-adi>   (ornek: shenzhen)" >&2
  exit 1
fi
case "$AD" in
  *-test|*/*|*" "*) echo "HATA: musteri adi duz olmali (ornek: shenzhen), '$AD' kabul edilmedi." >&2; exit 1 ;;
esac

KAYNAK_NS="tenant-${AD}"
HEDEF_NS="tenant-${AD}-test"
DB="teknikerp"
STAMP="$(date +%Y%m%d-%H%M)"
DUMP="/root/prova-kaynak-${AD}-${STAMP}.sql.gz"
ONCEKI="/root/prova-onceki-${AD}-${STAMP}.sql.gz"

# Pod icinde: sifre ortam degiskeninden, tek satir (SSH yapistirma kurali)
MYSQL='mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
DUMPCMD='mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --routines --default-character-set=utf8mb4'

say() { printf '\n==> %s\n' "$*"; }
sayim() {
  kubectl exec -n "$1" deploy/teknikerp-mysql -- sh -c "$MYSQL $DB -N -e \"SELECT CONCAT('urun=',(SELECT COUNT(*) FROM Product),' musteri=',(SELECT COUNT(*) FROM Customer),' fatura=',(SELECT COUNT(*) FROM Invoice),' hareket=',(SELECT COUNT(*) FROM Transaction))\"" 2>/dev/null
}

for ns in "$KAYNAK_NS" "$HEDEF_NS"; do
  kubectl get deploy/teknikerp-mysql -n "$ns" >/dev/null 2>&1 || {
    echo "HATA: $ns icinde teknikerp-mysql yok." >&2; exit 1; }
done

say "Kaynak $KAYNAK_NS : $(sayim "$KAYNAK_NS")"
say "Hedef  $HEDEF_NS : $(sayim "$HEDEF_NS")   (bunlar SILINECEK)"

say "Provanin mevcut verisi yedekleniyor: $ONCEKI"
kubectl exec -n "$HEDEF_NS" deploy/teknikerp-mysql -- sh -c "$DUMPCMD $DB" | gzip > "$ONCEKI"

say "Canlidan kopya aliniyor (kilitlemez, salt okur): $DUMP"
kubectl exec -n "$KAYNAK_NS" deploy/teknikerp-mysql -- sh -c "$DUMPCMD $DB" | gzip > "$DUMP"
if [ ! -s "$DUMP" ] || ! gzip -t "$DUMP" 2>/dev/null; then
  echo "HATA: kopya bos ya da bozuk, provaya dokunulmadi." >&2
  rm -f "$DUMP"; exit 1
fi
echo "    $(du -h "$DUMP" | cut -f1)"

say "Provaya yukleniyor"
# mysqldump ciktisi her tabloyu DROP+CREATE eder; oncekinden iz kalmaz
gunzip -c "$DUMP" | kubectl exec -i -n "$HEDEF_NS" deploy/teknikerp-mysql -- sh -c "$MYSQL $DB"

say "Backend yeniden baslatiliyor (bekleyen migration varsa uygulanir)"
kubectl rollout restart deploy/teknikerp-backend -n "$HEDEF_NS"
kubectl rollout status deploy/teknikerp-backend -n "$HEDEF_NS" --timeout=180s

say "Dogrulama"
K="$(sayim "$KAYNAK_NS")"; H="$(sayim "$HEDEF_NS")"
echo "    kaynak: $K"
echo "    hedef : $H"
if [ "$K" = "$H" ]; then
  echo "    BIREBIR TUTTU"
else
  echo "    FARKLI — kopya sirasinda canliya kayit girilmis olabilir; buyuk fark varsa tekrar calistir." >&2
fi

rm -f "$DUMP"
say "Bitti. Provanin onceki verisi $ONCEKI dosyasinda (gerekmezse silinebilir)."
