-- CARI MUTABAKATI — her musteri icin "olmasi gereken bakiye" vs kayitli bakiye
--
-- hesap = SUM(SATIS) - SUM(IADE) - SUM(ALIS)   (silinmis ve on siparis haric)
--       - SUM(GIRIS hareket) + SUM(CIKIS hareket)  (kasali/kasasiz, fis kaynakli dahil)
-- Nakit fisin kendi hareketi fisi sifirlar; cari fis oldugu gibi kalir;
-- kasasiz acilis kaydi bakiyeyi kurar. Fark = eksik/yanlis etiketli kayit.
--
--   kubectl exec -i -n <ns> deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/cari-mutabakat.sql

SELECT COUNT(*) musteri, SUM(ABS(balance-hesap)>0.005) farkli,
       ROUND(SUM(balance),2) kayitli_toplam, ROUND(SUM(hesap),2) hesaplanan_toplam
FROM (
  SELECT c.id, c.balance,
    IFNULL((SELECT SUM(CASE WHEN i.type='SATIS' THEN i.totalAmountTl ELSE -i.totalAmountTl END)
            FROM Invoice i WHERE i.customerId=c.id AND i.deletedAt IS NULL AND i.isPreOrder=0),0)
  - IFNULL((SELECT SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END)
            FROM Transaction t WHERE t.customerId=c.id),0) AS hesap
  FROM Customer c) x;

SELECT code, LEFT(name,25) musteri, ROUND(balance,2) kayitli, ROUND(hesap,2) hesaplanan, ROUND(balance-hesap,2) fark
FROM (
  SELECT c.code, c.name, c.balance,
    IFNULL((SELECT SUM(CASE WHEN i.type='SATIS' THEN i.totalAmountTl ELSE -i.totalAmountTl END)
            FROM Invoice i WHERE i.customerId=c.id AND i.deletedAt IS NULL AND i.isPreOrder=0),0)
  - IFNULL((SELECT SUM(CASE WHEN t.type='GIRIS' THEN t.amount ELSE -t.amount END)
            FROM Transaction t WHERE t.customerId=c.id),0) AS hesap
  FROM Customer c) x
WHERE ABS(balance-hesap)>0.005 ORDER BY ABS(balance-hesap) DESC LIMIT 30;
