-- ACILIS KAYITLARINI KASASIZ YAP — 11 Eylul 2026 "ESKI SISTEMDEN AKTARILDI"
--
-- Sorun: 50 acilis kaydi cari bakiyeleri kurmak icin tahsilat/tediye olarak
-- girildi; her biri kasadan para girmis/cikmis gibi islendi (26.372 $ cikis,
-- 14.860 $ giris -> kasadan 11.512 $ hic cikmamis para cikmis gorunuyor).
--
-- Kapsam (17 Eylul duzeltmesi): 37 kayit "ESKI SISTEMDEN AKTARILDI", 12 kayit
-- yalnizca "AKTARILDI" (11 Eylul 20:57-21:07, ODM-0039..0050, 11.271,10 $ giris)
-- — ayni is, kisa aciklama. Toplam 49; iki 5 $'lik deneme kaydi (120) kalir.
--
-- Cozum (v1.22.15 ile gelen KASASIZ cari kaydi): bu kayitlarin safeId'si
-- NULL yapilir ve kasa bakiyesi, kayitlarin kasaya yaptigi etki kadar GERI
-- alinir. Musteri bakiyelerine DOKUNULMAZ (onlar dogru). Kayitlar silinmez.
-- Tekrar calistirilirsa bir sey yapmaz (safeId zaten NULL, kayit bulunamaz).
--
-- ONKOSUL: v1.22.15 kurulu olmali (Transaction.safeId NULL kabul etmeli).
-- SIRA: once PROVA, sonra musteri onayiyla CANLI. Tek satir:
--   kubectl exec -i -n <ns> deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/acilis-kayitlari-kasasiz.sql

-- 1) ONCE: kayit sayisi, kasa etkisi, kasa bakiyesi
SELECT 'ONCE' AS asama, COUNT(*) AS acilis_kaydi,
       ROUND(SUM(CASE WHEN type='GIRIS' THEN amount ELSE 0 END),2) AS giris,
       ROUND(SUM(CASE WHEN type='CIKIS' THEN amount ELSE 0 END),2) AS cikis,
       ROUND(SUM(CASE WHEN type='GIRIS' THEN amount ELSE -amount END),2) AS kasaya_net_etkisi
FROM Transaction WHERE safeId IS NOT NULL AND (UPPER(description) LIKE '%ESK_ S_STEM%' OR (description = 'AKTARILDI' AND createdAt < '2026-09-12 03:00:00'));
SELECT 'ONCE' AS asama, s.name, ROUND(s.balance,2) AS kasa_bakiyesi FROM Safe s;

-- 2) Kasa bakiyesini geri al (her kasa icin kendi kayitlarinin net etkisi kadar)
UPDATE Safe s
JOIN (
  SELECT safeId, SUM(CASE WHEN type='GIRIS' THEN amount ELSE -amount END) AS net
  FROM Transaction
  WHERE safeId IS NOT NULL AND (UPPER(description) LIKE '%ESK_ S_STEM%' OR (description = 'AKTARILDI' AND createdAt < '2026-09-12 03:00:00'))
  GROUP BY safeId
) t ON t.safeId = s.id
SET s.balance = s.balance - t.net;
SELECT ROW_COUNT() AS guncellenen_kasa;

-- 3) Kayitlari kasasiz yap
UPDATE Transaction
SET safeId = NULL, method = NULL
WHERE safeId IS NOT NULL AND (UPPER(description) LIKE '%ESK_ S_STEM%' OR (description = 'AKTARILDI' AND createdAt < '2026-09-12 03:00:00'));
SELECT ROW_COUNT() AS kasasiz_yapilan_kayit;

-- 4) SONRA: kasa bakiyesi = kasali hareketlerin toplami olmali
SELECT 'SONRA' AS asama, s.name, ROUND(s.balance,2) AS kasa_bakiyesi,
       ROUND(IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0),2) AS hareket_toplami,
       ROUND(s.balance - IFNULL(SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END),0),2) AS fark
FROM Safe s LEFT JOIN Transaction t ON t.safeId = s.id GROUP BY s.id;
SELECT COUNT(*) AS kasasiz_kayit FROM Transaction WHERE safeId IS NULL;
