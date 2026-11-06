-- ALIS FISLERININ SAATINI DUZELT — 6 Kasim 2026
--
-- Sorun: Fatura Listesi > Alis bolumunde her fisin saati 03:00 goruluyordu.
-- Sebep (index.ts:3748): alis ucu `new Date(invoiceDate)` yaziyordu.
-- "2026-11-06" gibi saatsiz bir metin UTC gece yarisi olarak cozulur;
-- Istanbul UTC+3 oldugu icin ekranda 03:00 cikar. Satis ucu ayni isi
-- `buildInvoiceCreatedAt` ile yapiyordu (tarih + o anki saat) — hata
-- yalnizca alista. Kapsam: canli 417/417, prova 23/23 ALIS fisi.
-- Kod tarafi v1.22.26 ile duzeldi; bu betik GECMISI duzeltir.
--
-- Saati nereden buluyoruz: fis no YYMMDDHHmmss bicimindedir ve fis
-- KAYDEDILDIGI ANDA uretilir (generateTimestampInvoiceNo, Istanbul saati).
-- Yani gercek giris saati fis numarasinin icinde duruyor; createdAt'in
-- bozulmasi onu silmedi.
--
-- Ne yapiyor: fisin GUNU oldugu gibi kalir, SAATI fis numarasindan alinir.
--   261106105442  ->  Istanbul 2026-11-06 10:54:42  ->  UTC 07:54:42
--
-- NEDEN SABIT 3 SAAT: Turkiye Eylul 2016'dan beri kalici UTC+3, yaz saati
-- uygulamasi yok. CONVERT_TZ kullanilmadi cunku mysql:8.0 imajinda saat
-- dilimi tablolari yuklu degil.
--
-- GUN KAYMASI YOK: kaydin Istanbul gunu D ise yeni deger de D gunundedir
-- (insa bicimi geregi). Gece 00:00-02:59 arasi girilmis bir fiste saklanan
-- UTC tarihi bir gun geriye gider ama Istanbul gunu AYNI kalir; raporlar
-- gun sinirlarini Istanbul'a gore kuruyor (raporAraligi + TZ=Europe/Istanbul),
-- o yuzden hicbir fis baska gune tasinmaz. Asagidaki 1. sorgu bunu olcer:
-- `gun_kayan` 0 cikmali.
--
-- Dokunmadiklari: tutarlar, stok, FIFO katmanlari, kasa hareketleri ve cari
-- bakiye. Yalnizca Invoice.createdAt yazilir. Alis fisinin kasa hareketi
-- (Transaction) zaten gercek saatle kaydediliyordu; duzeltmeden sonra ikisi
-- ortusur.
--
-- Tekrar calistirilabilir: saati duzelen kayit bir daha secilmez
-- (TIME_TO_SEC artik 0 degil). Tam 03:00:00'da girilmis bir alis varsa her
-- kosuda yeniden secilir ama ayni degeri yazar — zarari yok.
--
-- SIRA: once PROVA (tenant-shenzhen-test), sonra onayla CANLI. Tek satir:
--   kubectl exec -i -n <ns> deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/alis-fis-saati-duzelt.sql
--
-- Geri alma: k8s/sql/GERI-AL-alis-fis-saati.sql (ya da gun basi yedegi).

-- 1) ONCE — kac fis etkilenecek, gun kayan var mi, ornek satirlar
SELECT 'ONCE' AS asama, COUNT(*) AS duzeltilecek_fis,
       SUM(DATE(createdAt + INTERVAL 3 HOUR) <> DATE(yeni + INTERVAL 3 HOUR)) AS gun_kayan,
       MIN(DATE(createdAt)) AS en_eski, MAX(DATE(createdAt)) AS en_yeni
FROM (
  SELECT createdAt,
         DATE_SUB(STR_TO_DATE(CONCAT(DATE(createdAt), ' ',
                   SUBSTRING(invoiceNo, 7, 2), ':', SUBSTRING(invoiceNo, 9, 2), ':',
                   SUBSTRING(invoiceNo, 11, 2)), '%Y-%m-%d %H:%i:%s'),
                 INTERVAL 3 HOUR) AS yeni
  FROM Invoice
  WHERE type = 'ALIS' AND TIME_TO_SEC(createdAt) = 0
    AND invoiceNo REGEXP '^[0-9]{12}'
    AND SUBSTRING(invoiceNo, 7, 6) REGEXP '^([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$'
) x;

SELECT 'ONCE-ORNEK' AS asama, id, invoiceNo,
       createdAt + INTERVAL 3 HOUR AS ekranda_simdi,
       DATE_SUB(STR_TO_DATE(CONCAT(DATE(createdAt), ' ',
                 SUBSTRING(invoiceNo, 7, 2), ':', SUBSTRING(invoiceNo, 9, 2), ':',
                 SUBSTRING(invoiceNo, 11, 2)), '%Y-%m-%d %H:%i:%s'),
               INTERVAL 3 HOUR) + INTERVAL 3 HOUR AS ekranda_olacak
FROM Invoice
WHERE type = 'ALIS' AND TIME_TO_SEC(createdAt) = 0
  AND invoiceNo REGEXP '^[0-9]{12}'
  AND SUBSTRING(invoiceNo, 7, 6) REGEXP '^([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$'
ORDER BY id DESC LIMIT 10;

-- 2) Duzeltme
UPDATE Invoice
SET createdAt = DATE_SUB(STR_TO_DATE(CONCAT(DATE(createdAt), ' ',
                  SUBSTRING(invoiceNo, 7, 2), ':', SUBSTRING(invoiceNo, 9, 2), ':',
                  SUBSTRING(invoiceNo, 11, 2)), '%Y-%m-%d %H:%i:%s'),
                INTERVAL 3 HOUR)
WHERE type = 'ALIS' AND TIME_TO_SEC(createdAt) = 0
  AND invoiceNo REGEXP '^[0-9]{12}'
  AND SUBSTRING(invoiceNo, 7, 6) REGEXP '^([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]$';
SELECT ROW_COUNT() AS duzeltilen_fis;

-- 3) SONRA — gece yarisinda kalan var mi, ornek satirlar
SELECT 'SONRA' AS asama, type,
       COUNT(*) AS fis,
       SUM(TIME_TO_SEC(createdAt) = 0) AS hala_gece_yarisi
FROM Invoice GROUP BY type;

SELECT 'SONRA-ORNEK' AS asama, id, invoiceNo,
       createdAt + INTERVAL 3 HOUR AS ekranda
FROM Invoice WHERE type = 'ALIS' ORDER BY id DESC LIMIT 10;
