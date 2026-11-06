-- GERI AL: alis-fis-saati-duzelt.sql — 6 Kasim 2026
--
-- Duzeltilen alis fislerinin saatini eski haline (UTC gece yarisi, ekranda
-- 03:00) dondurur. Tutar, stok, kasa ve cari bakiyeye dokunmaz.
--
-- DIKKAT — ID SINIRI VERMEK ZORUNLU.
-- Duzeltmeden SONRA girilen alis fisleri de "saati fis nosuyla uyumlu"
-- gorunur (ikisi de ayni anda uretiliyor), yani onlari bu betikten ayirt
-- etmenin yolu YOK. Sinir vermezsen DOGRU saatli yeni fisleri de bozarsin.
--
-- 1) Duzeltmeyi kosmadan ONCE en buyuk alis fisi id'sini not al:
--      SELECT MAX(id) FROM Invoice WHERE type='ALIS';
-- 2) Asagidaki satirdaki 0'i o sayiyla degistir.
-- 3) Tek satirla kos:
--      kubectl exec -i -n <ns> deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/GERI-AL-alis-fis-saati.sql
--
-- Sinir 0 kalirsa betik HICBIR SEY yapmaz — bilerek boyle.
--
-- Not: asil geri donus yolu gun basi yedegidir
-- (/root/canli-yedek-*.sql.gz). Bu betik yalnizca "saat degisikligini geri
-- al, gerisi kalsin" durumu icindir.

SET @son_id = 0;   -- <<< BURAYI DEGISTIR

SELECT 'ONCE' AS asama, @son_id AS id_siniri, COUNT(*) AS geri_alinacak
FROM Invoice
WHERE type = 'ALIS' AND id <= @son_id AND TIME_TO_SEC(createdAt) <> 0;

UPDATE Invoice
SET createdAt = DATE(createdAt + INTERVAL 3 HOUR)
WHERE type = 'ALIS' AND id <= @son_id AND TIME_TO_SEC(createdAt) <> 0;
SELECT ROW_COUNT() AS geri_alinan;

SELECT 'SONRA' AS asama, id, invoiceNo, createdAt + INTERVAL 3 HOUR AS ekranda
FROM Invoice WHERE type = 'ALIS' ORDER BY id DESC LIMIT 10;
