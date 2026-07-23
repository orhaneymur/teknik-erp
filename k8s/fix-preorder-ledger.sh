#!/bin/bash
# ---------------------------------------------------------------------------
# v1.8.47 tek seferlik veri duzeltmesi — ON SIPARIS CARI IZOLASYONU
#
# v1.8.47 oncesinde on siparis KAYDEDILIRKEN cari bakiyeye / kasaya kayit
# dusuluyor, "Stok Dus (On Siparisi Tamamla)" adiminda ise HICBIR mali kayit
# yapilmiyordu. v1.8.47 ile bu ters cevrildi: on siparis mali kayit uretmez,
# mali etki yalnizca tamamlanma aninda islenir.
#
# Bu yuzden surumden ONCE olusmus ve HALA ACIK olan on siparislerin eski
# etkisinin geri alinmasi gerekir; aksi halde tamamlandiklarinda tutar
# CIFT islenir.
#
# Kullanim:
#   ./fix-preorder-ledger.sh            -> yalnizca RAPOR (hicbir sey degismez)
#   ./fix-preorder-ledger.sh --apply    -> duzeltmeyi uygular (idempotent)
# ---------------------------------------------------------------------------
set -euo pipefail

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

DEPLOY="akgunteknik-mysql"
MYSQL_ROOT_PASSWORD="akgunteknik123"
MYSQL_DATABASE="akgunteknik"
FIX_NAME="preorder_ledger_isolation_v1_8_47"

echo "==> MySQL pod bekleniyor..."
kubectl wait --for=condition=Ready pod -l "app=${DEPLOY}" --timeout=300s
POD="$(kubectl get pod -l "app=${DEPLOY}" -o jsonpath='{.items[0].metadata.name}')"
echo "==> Pod: ${POD}"

mysql_exec() {
  kubectl exec "$POD" -- mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" -e "$1"
}

mysql_value() {
  kubectl exec "$POD" -- mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" -N -e "$1"
}

# Acik on siparisleri tanimlayan ortak kosul
PREORDER_WHERE="i.type='SATIS' AND i.isPreOrder=1 AND i.deletedAt IS NULL"

# On siparisten dogmus, elle girilmemis (receiptNo NULL) kasa hareketleri
ORPHAN_TX_JOIN="
  FROM \`Transaction\` t
  JOIN \`Invoice\` i
    ON ${PREORDER_WHERE}
   AND t.customerId = i.customerId
   AND t.safeId     = i.safeId
   AND t.type       = 'GIRIS'
   AND ROUND(t.amount, 2) = ROUND(i.totalAmountTl, 2)
   AND t.description LIKE CONCAT(i.invoiceNo, '%')
  WHERE t.receiptNo IS NULL
"

mysql_exec "CREATE TABLE IF NOT EXISTS \`_AkgunDataFix\` (
  \`name\` VARCHAR(191) NOT NULL,
  \`appliedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`name\`)
);"

ALREADY="$(mysql_value "SELECT COUNT(*) FROM \`_AkgunDataFix\` WHERE name='${FIX_NAME}';")"
if [[ "$ALREADY" -gt 0 ]]; then
  echo "==> Bu duzeltme daha once uygulanmis (${FIX_NAME}). Cikiliyor."
  exit 0
fi

echo
echo "===================== ETKILENECEK KAYITLAR ====================="
echo "-- Acik on siparisler (Acik fatura / Cari): musteri bakiyesinden dusulecek"
mysql_exec "SELECT i.customerId, c.code, c.name, COUNT(*) AS fis, ROUND(SUM(i.totalAmountTl),2) AS geri_alinacak
  FROM \`Invoice\` i JOIN \`Customer\` c ON c.id = i.customerId
  WHERE ${PREORDER_WHERE} AND i.paymentMethod = 'Cari'
  GROUP BY i.customerId, c.code, c.name ORDER BY geri_alinacak DESC;"

echo "-- Acik on siparisler (Kapali fatura / kasadan): kasa bakiyesinden dusulecek"
mysql_exec "SELECT i.safeId, s.name, COUNT(*) AS fis, ROUND(SUM(i.totalAmountTl),2) AS geri_alinacak
  FROM \`Invoice\` i JOIN \`Safe\` s ON s.id = i.safeId
  WHERE ${PREORDER_WHERE} AND i.paymentMethod IN ('Nakit','EFT/Havale','Kart')
  GROUP BY i.safeId, s.name ORDER BY geri_alinacak DESC;"

ORPHAN_COUNT="$(mysql_value "SELECT COUNT(*) ${ORPHAN_TX_JOIN};")"
echo "-- Silinecek on siparis kaynakli kasa hareketi sayisi: ${ORPHAN_COUNT}"
mysql_exec "SELECT t.id, t.amount, t.description ${ORPHAN_TX_JOIN} LIMIT 50;"
echo "================================================================"
echo

if [[ "$APPLY" -eq 0 ]]; then
  echo "RAPOR MODU — hicbir sey degistirilmedi."
  echo "Uygulamak icin:  ./fix-preorder-ledger.sh --apply"
  exit 0
fi

echo "==> Duzeltme uygulaniyor..."

mysql_exec "UPDATE \`Customer\` c
  JOIN (
    SELECT i.customerId AS cid, SUM(i.totalAmountTl) AS total
    FROM \`Invoice\` i
    WHERE ${PREORDER_WHERE} AND i.paymentMethod = 'Cari'
    GROUP BY i.customerId
  ) x ON c.id = x.cid
  SET c.balance = ROUND(c.balance - x.total, 2);"
echo "    + Cari bakiyeler duzeltildi"

mysql_exec "UPDATE \`Safe\` s
  JOIN (
    SELECT i.safeId AS sid, SUM(i.totalAmountTl) AS total
    FROM \`Invoice\` i
    WHERE ${PREORDER_WHERE} AND i.paymentMethod IN ('Nakit','EFT/Havale','Kart')
    GROUP BY i.safeId
  ) x ON s.id = x.sid
  SET s.balance = ROUND(s.balance - x.total, 2);"
echo "    + Kasa bakiyeleri duzeltildi"

mysql_exec "DELETE t ${ORPHAN_TX_JOIN};"
echo "    + ${ORPHAN_COUNT} on siparis kasa hareketi silindi"

mysql_exec "INSERT INTO \`_AkgunDataFix\` (\`name\`) VALUES ('${FIX_NAME}');"
echo "==> Tamam. Duzeltme isaretlendi: ${FIX_NAME}"
