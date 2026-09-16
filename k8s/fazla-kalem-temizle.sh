#!/bin/bash
#
# Bir fisteki KATLANMIS kalemleri uygulamanin kendi duzenleme ucuyla siler.
#
#   bash k8s/fazla-kalem-temizle.sh tenant-shenzhen-test 260915094213           # yalnizca goster
#   bash k8s/fazla-kalem-temizle.sh tenant-shenzhen-test 260915094213 --uygula  # sil
#
# 17 Eylul 2026 olayi: duzenlemede eklenen kalem her Kaydet'te yeniden
# yaziliyordu (v1.22.17'de duzeltildi). Geride kalan fazla kalemler burada
# temizlenir.
#
# Ne silinir: ayni fiste ayni urunun, EN DUSUK id'li satiriyla adet VE
# fiyati birebir ayni olan diger satirlari. Adedi/fiyati farkli satir
# (ornek: 3 ve 5 adet) SILINMEZ, "elle bak" diye listelenir — hangisinin
# dogru oldugunu musteri soyler.
#
# Nasil silinir: PUT /api/sales/invoices/:id { removeItemIds, items: [] } —
# ekrandaki "satiri sil + Kaydet" ile ayni yol. Sunucu tek transaction'da
# stogu geri alir, fis toplamini dusurur, cari/kasayi mutabakatla duzeltir.
# Elle SQL yok. `items: []` bilerek gonderilir: sunucu mali mutabakati
# yalnizca items alani geldiginde yapar.
#
# Duzelmeyen: FIFO katmanlari. Temizlikten SONRA Excel indir-yukle turu
# katmanlari stoga esitler.
#
# Varsayilan yalnizca gosterir; --uygula olmadan hicbir sey degismez.
# Once prova (tenant-<ad>-test), sonra canli — canli icin ayrica yedek al.
set -euo pipefail

NS="${1:-}"
FISNO="${2:-}"
UYGULA="${3:-}"
if [ -z "$NS" ] || [ -z "$FISNO" ]; then
  echo "Kullanim: bash k8s/fazla-kalem-temizle.sh <namespace> <fisNo> [--uygula]" >&2
  exit 1
fi
case "$FISNO" in *[!0-9]*) echo "HATA: fis no yalnizca rakam olmali." >&2; exit 1 ;; esac

DB="teknikerp"
MYSQL='mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
# KUBECTL yalnizca yerel deneme icin degistirilir (sahte kubectl ile docker'a yonlendirme)
KUBECTL="${KUBECTL:-kubectl}"
sql() { "$KUBECTL" exec -n "$NS" deploy/teknikerp-mysql -- sh -c "$MYSQL $DB $1 -e \"$2\"" 2>/dev/null; }
say() { printf '\n==> %s\n' "$*"; }

FIS_ID="$(sql -N "SELECT id FROM Invoice WHERE invoiceNo='$FISNO' AND deletedAt IS NULL")"
if [ -z "$FIS_ID" ]; then echo "HATA: $NS icinde $FISNO bulunamadi (ya da silinmis)." >&2; exit 1; fi

# Ilk satir = urunun en dusuk id'li kalemi; kopya = adet ve fiyati ona esit digerleri
KOPYA_WHERE="ii.invoiceId=$FIS_ID AND ii.id<>ilk.id AND ii.quantity=ilk.quantity AND ABS(ii.unitPrice-ilk.unitPrice)<0.005"
ILK_JOIN="JOIN (SELECT productId, MIN(id) id, quantity, unitPrice FROM InvoiceItem WHERE invoiceId=$FIS_ID GROUP BY productId, quantity, unitPrice) ilk ON ilk.productId=ii.productId"
# Not: ilk alt sorgu adet+fiyat kirilimli; bir urunun 3'lu ve 5'li satirlari
# ayri "ilk" sayilir, birbirini silmez.

say "Fis $FISNO ($NS) — fis id $FIS_ID"
sql -t "SELECT i.invoiceNo, i.type, i.paymentMethod, i.totalAmountUsd toplam, c.code, c.name, c.balance bakiye, (SELECT COUNT(*) FROM InvoiceItem WHERE invoiceId=i.id) kalem FROM Invoice i JOIN Customer c ON c.id=i.customerId WHERE i.id=$FIS_ID"

say "Silinecek KOPYA satirlar (ilk satir kalir):"
sql -t "SELECT ii.id, p.sku, ii.quantity adet, ii.unitPrice fiyat, ilk.id kalan_satir FROM InvoiceItem ii $ILK_JOIN JOIN Product p ON p.id=ii.productId WHERE $KOPYA_WHERE ORDER BY p.sku, ii.id"
sql -t "SELECT COUNT(*) fazla_kalem, COALESCE(SUM(ii.quantity),0) fazla_adet, COALESCE(ROUND(SUM(ii.quantity*ii.unitPrice),2),0) fazla_tutar FROM InvoiceItem ii $ILK_JOIN WHERE $KOPYA_WHERE"

say "ELLE BAK — ayni urun, farkli adet/fiyat (dokunulmaz):"
sql -t "SELECT p.sku, GROUP_CONCAT(ii.id ORDER BY ii.id) idler, GROUP_CONCAT(ii.quantity ORDER BY ii.id) adetler, GROUP_CONCAT(ii.unitPrice ORDER BY ii.id) fiyatlar FROM InvoiceItem ii JOIN Product p ON p.id=ii.productId WHERE ii.invoiceId=$FIS_ID GROUP BY ii.productId HAVING COUNT(DISTINCT ii.quantity, ii.unitPrice)>1"

IDLER="$(sql -N "SELECT GROUP_CONCAT(ii.id ORDER BY ii.id) FROM InvoiceItem ii $ILK_JOIN WHERE $KOPYA_WHERE" | tr -d '[:space:]')"
if [ -z "$IDLER" ] || [ "$IDLER" = "NULL" ]; then say "Kopya satir yok, yapilacak bir sey yok."; exit 0; fi

if [ "$UYGULA" != "--uygula" ]; then
  say "Yalnizca gosterildi. Silmek icin sona --uygula ekle."
  exit 0
fi

say "Stok (ONCE) — etkilenen urunler:"
STOK_SQL="SELECT p.sku, ps.quantity FROM ProductStock ps JOIN Product p ON p.id=ps.productId JOIN Branch b ON b.id=ps.branchId WHERE b.name='MERKEZ_DEPO' AND ps.productId IN (SELECT DISTINCT productId FROM InvoiceItem WHERE invoiceId=$FIS_ID) ORDER BY p.sku"
sql -t "$STOK_SQL"

say "Uygulamaya giris yapilip PUT /api/sales/invoices/$FIS_ID cagriliyor (removeItemIds: $IDLER)"
# Backend pod'unun icinden, kendi ortam degiskenleriyle (admin sifresi
# Secret'tan gelir, burada yazilmaz). Tek satir node — heredoc yok.
"$KUBECTL" exec -n "$NS" deploy/teknikerp-backend -- node -e "const ids=process.argv[1].split(',').map(Number);const fid=process.argv[2];(async()=>{const g=await fetch('http://127.0.0.1:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});const gj=await g.json();if(!gj.data||!gj.data.token){console.error('GIRIS BASARISIZ',JSON.stringify(gj));process.exitCode=1;return;}const r=await fetch('http://127.0.0.1:3000/api/sales/invoices/'+fid,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+gj.data.token},body:JSON.stringify({removeItemIds:ids,items:[]})});const j=await r.json();console.log(r.status,j.success?('OK kalem='+(j.data&&j.data.items?j.data.items.length:'?')+' toplam='+(j.data?j.data.totalAmountUsd:'?')):('HATA '+j.message));process.exitCode=j.success?0:1;})().catch(e=>{console.error(e);process.exitCode=1;});" "$IDLER" "$FIS_ID"

say "SONRA — fis, bakiye, kalem sayisi:"
sql -t "SELECT i.invoiceNo, i.totalAmountUsd toplam, c.code, c.balance bakiye, (SELECT COUNT(*) FROM InvoiceItem WHERE invoiceId=i.id) kalem FROM Invoice i JOIN Customer c ON c.id=i.customerId WHERE i.id=$FIS_ID"
say "Stok (SONRA):"
sql -t "$STOK_SQL"
say "Bitti. Katmanlar icin Excel indir-yukle turu bu temizlikten sonra yapilir."
