-- FIS KAYNAKLI HAREKETIN MUSTERISINI FISE ESITLE
--
-- Teshis (17 Eylul 2026, prova): fis Genel Musteri'ye nakit kesilip sonra
-- musterisi degistirilince eski surum (v1.21.4) fisi tasimis ama kasa
-- hareketinin customerId'sini eski musteride birakmis. Bakiyeler dogru
-- (nakit fis bakiyeye dokunmaz), yalnizca hareketin ETIKETI yanlis; cari
-- mutabakatinda Genel -6.241,50 / Ahmet +6.203,50 / Murat 27 / Ismail 11
-- diye gorunuyordu. Tutar, kasa, bakiye DEGISMEZ; yalnizca customerId.
-- Tekrar calistirilirsa bir sey yapmaz.
--
--   kubectl exec -i -n <ns> deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/hareket-musteri-esitle.sql

SELECT 'ONCE' AS asama, t.id, LEFT(t.description,40) aciklama, t.amount, ct.code hareket_musterisi, ci.code fis_musterisi
FROM Transaction t
JOIN Invoice i ON t.receiptNo IS NULL AND t.description LIKE CONCAT(i.invoiceNo, ' %')
LEFT JOIN Customer ct ON ct.id=t.customerId JOIN Customer ci ON ci.id=i.customerId
WHERE t.customerId <> i.customerId;

UPDATE Transaction t
JOIN Invoice i ON t.receiptNo IS NULL AND t.description LIKE CONCAT(i.invoiceNo, ' %')
SET t.customerId = i.customerId
WHERE t.customerId <> i.customerId;
SELECT ROW_COUNT() AS esitlenen_hareket;
