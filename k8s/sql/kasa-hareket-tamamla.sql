-- KASA HAREKETI TAMAMLAMA — v1.21.4'un yazmadigi "duzenleme farki" hareketleri
--
-- Teshis (16 Eylul 2026, prova = canli kopyasi):
--   Dolar kasasi bakiyesi 2.767,46 $, hareket toplami 887,21 $, fark 1.880,25 $.
--   22 nakit SATIS fisinde fis tutari != kasa hareketi toplami; farklarin
--   toplami 1.880,25 $ — kurusuna kadar ayni. Eski surum fis Cari->Nakit
--   cevrilince ya da tutar degisince KASA BAKIYESINI duzeltiyor ama HAREKET
--   yazmiyordu (v1.22.0'da duzeltildi; bu betik eski kayitlari tamamlar).
--
-- Ne yapar: her boyle fis icin EKSIK hareketi yazar
--   ("<fisno> duzenleme farki (eski surum)"). Kasa bakiyesine, musteri
--   bakiyesine, fise DOKUNMAZ. Tekrar calistirilirsa bir sey yapmaz
--   (fark sifirlanmis olur).
-- Sonuc: hareket toplami = kasa bakiyesi; ekstrede "Tahsil edildi" fis
--   tutarina esit; kasa raporu dogru.
--
-- SIRA: once PROVA (tenant-shenzhen-test), sonuc goruldukten sonra
-- musteri onayiyla CANLI. Tek satir:
--   kubectl exec -i -n <ns> deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/kasa-hareket-tamamla.sql

-- 1) ONCE: kasa bakiyesi vs hareket toplami
SELECT 'ONCE' AS asama, s.name, ROUND(s.balance,2) kasa_bakiyesi,
       ROUND(IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0),2) hareket_toplami,
       ROUND(s.balance - IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0),2) fark
FROM Safe s LEFT JOIN Transaction t ON t.safeId=s.id GROUP BY s.id;

-- 2) Eksik hareketleri yaz (yalnizca nakit-benzeri SATIS, silinmemis, teslim edilmis)
INSERT INTO Transaction (safeId, customerId, type, amount, description, createdAt)
SELECT f.safeId, f.customerId,
       IF(f.fark > 0, 'GIRIS', 'CIKIS'),
       ROUND(ABS(f.fark), 2),
       CONCAT(f.invoiceNo, ' düzenleme farkı (eski sürüm)'),
       f.updatedAt
FROM (
  SELECT i.id, i.invoiceNo, i.safeId, i.customerId, i.updatedAt,
         i.totalAmountTl - IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0) AS fark
  FROM Invoice i
  LEFT JOIN Transaction t ON t.receiptNo IS NULL AND t.description LIKE CONCAT(i.invoiceNo, ' %')
  WHERE i.type='SATIS' AND i.deletedAt IS NULL AND i.isPreOrder=0
    AND i.paymentMethod IN ('Nakit','Kart','EFT/Havale')
  GROUP BY i.id
  HAVING ABS(fark) > 0.005
) f;
SELECT ROW_COUNT() AS yazilan_hareket;

-- 3) SONRA: fark 0 olmali
SELECT 'SONRA' AS asama, s.name, ROUND(s.balance,2) kasa_bakiyesi,
       ROUND(IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0),2) hareket_toplami,
       ROUND(s.balance - IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0),2) fark
FROM Safe s LEFT JOIN Transaction t ON t.safeId=s.id GROUP BY s.id;

-- 4) Kalan uyumsuz SATIS fisi (0 olmali)
SELECT COUNT(*) AS kalan_uyumsuz_fis FROM (
  SELECT i.id, i.totalAmountTl - IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0) AS fark
  FROM Invoice i
  LEFT JOIN Transaction t ON t.receiptNo IS NULL AND t.description LIKE CONCAT(i.invoiceNo, ' %')
  WHERE i.type='SATIS' AND i.deletedAt IS NULL AND i.isPreOrder=0
    AND i.paymentMethod IN ('Nakit','Kart','EFT/Havale')
  GROUP BY i.id HAVING ABS(fark) > 0.005
) k;
