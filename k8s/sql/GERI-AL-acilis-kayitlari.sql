-- GERI ALMA: acilis-kayitlari-kasasiz.sql'in tersi
--
-- Kasasiz yapilmis 11 Eylul acilis kayitlarini yeniden Dolar Kasasi'na
-- baglar ve kasa bakiyesini net etki kadar geri dusurur. Yalnizca
-- "sonuc beklendigi gibi cikmadi" durumunda; once yedekle karsilastir.
--
--   kubectl exec -i -n <ns> deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/GERI-AL-acilis-kayitlari.sql

SELECT 'ONCE' AS asama, COUNT(*) AS kasasiz_acilis FROM Transaction WHERE safeId IS NULL AND UPPER(description) LIKE '%ESK_ S_STEM%';
SELECT 'ONCE' AS asama, s.name, ROUND(s.balance,2) AS kasa_bakiyesi FROM Safe s;

-- Hedef kasa: USD etiketli ilk kasa (Shenzhen'de tek kasa: Dolar Kasasi)
SET @kasa := (SELECT id FROM Safe WHERE currency='USD' ORDER BY id LIMIT 1);

UPDATE Safe SET balance = balance + (
  SELECT IFNULL(SUM(CASE WHEN type='GIRIS' THEN amount ELSE -amount END),0)
  FROM Transaction WHERE safeId IS NULL AND UPPER(description) LIKE '%ESK_ S_STEM%'
) WHERE id = @kasa;

UPDATE Transaction SET safeId = @kasa
WHERE safeId IS NULL AND UPPER(description) LIKE '%ESK_ S_STEM%';
SELECT ROW_COUNT() AS kasaya_geri_baglanan;

SELECT 'SONRA' AS asama, s.name, ROUND(s.balance,2) AS kasa_bakiyesi,
       ROUND(IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0),2) AS hareket_toplami
FROM Safe s LEFT JOIN Transaction t ON t.safeId = s.id GROUP BY s.id;
