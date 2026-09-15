-- STOK MUTABAKATI — yukleme anindaki stok + hareketler = beklenen; simdiki ile fark
--
-- PROVADA calisir (tenant-shenzhen-test). Iki veritabani ayni MySQL'de olmali:
--   teknikerp  : canlinin guncel kopyasi (prova-tazele.sh)
--   yedek1209  : 12 Eylul 03:00 gece yedegi (ilk yuklemeden sonra, ilk satistan once)
--
-- Hareket kurali (kodla ayni):
--   ALIS                       -> MERKEZ_DEPO +adet
--   SATIS (teslim edilmis)     -> MERKEZ_DEPO -adet   (on siparis stok dusurmez)
--   IADE (Cin iade degil)      -> MERKEZ_DEPO +adet   (Cin iade CIN_IADE_DEPO'ya gider)
--   silinmis fis               -> sayilmaz (silinince etkisi geri alinir)
-- Bu kurala girmeyen her fark: elle stok duzenleme, depo transferi ya da hata.
--
-- Calistirma (tek satir):
--   kubectl exec -i -n tenant-shenzhen-test deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -t' < k8s/sql/stok-mutabakat.sql

SELECT COUNT(*) AS farkli_urun, SUM(fark) AS toplam_fark,
       SUM(CASE WHEN fark < 0 THEN fark ELSE 0 END) AS eksik_toplam,
       SUM(CASE WHEN fark > 0 THEN fark ELSE 0 END) AS fazla_toplam
FROM (
  SELECT IFNULL(s.quantity,0) - (IFNULL(y.quantity,0) + IFNULL(h.alis,0) - IFNULL(h.satis,0) + IFNULL(h.iade,0)) AS fark
  FROM teknikerp.Product p
  JOIN teknikerp.Branch b ON b.name = 'MERKEZ_DEPO'
  LEFT JOIN yedek1209.ProductStock y ON y.productId = p.id AND y.branchId = b.id
  LEFT JOIN teknikerp.ProductStock s ON s.productId = p.id AND s.branchId = b.id
  LEFT JOIN (
    SELECT ii.productId,
      SUM(CASE WHEN i.type = 'ALIS' THEN ii.quantity ELSE 0 END) AS alis,
      SUM(CASE WHEN i.type = 'SATIS' AND i.isPreOrder = 0 THEN ii.quantity ELSE 0 END) AS satis,
      SUM(CASE WHEN i.type = 'IADE' AND ii.isChinaReturn = 0 THEN ii.quantity ELSE 0 END) AS iade
    FROM teknikerp.InvoiceItem ii
    JOIN teknikerp.Invoice i ON i.id = ii.invoiceId
    WHERE i.deletedAt IS NULL
    GROUP BY ii.productId
  ) h ON h.productId = p.id
  WHERE p.deletedAt IS NULL
) t
WHERE ABS(fark) > 0.001;

SELECT * FROM (
  SELECT p.sku, LEFT(p.name, 40) AS urun,
    IFNULL(y.quantity,0) AS yukleme_1109,
    IFNULL(h.alis,0) AS alis, IFNULL(h.satis,0) AS satis, IFNULL(h.iade,0) AS iade,
    IFNULL(y.quantity,0) + IFNULL(h.alis,0) - IFNULL(h.satis,0) + IFNULL(h.iade,0) AS beklenen,
    IFNULL(s.quantity,0) AS simdiki,
    IFNULL(s.quantity,0) - (IFNULL(y.quantity,0) + IFNULL(h.alis,0) - IFNULL(h.satis,0) + IFNULL(h.iade,0)) AS fark
  FROM teknikerp.Product p
  JOIN teknikerp.Branch b ON b.name = 'MERKEZ_DEPO'
  LEFT JOIN yedek1209.ProductStock y ON y.productId = p.id AND y.branchId = b.id
  LEFT JOIN teknikerp.ProductStock s ON s.productId = p.id AND s.branchId = b.id
  LEFT JOIN (
    SELECT ii.productId,
      SUM(CASE WHEN i.type = 'ALIS' THEN ii.quantity ELSE 0 END) AS alis,
      SUM(CASE WHEN i.type = 'SATIS' AND i.isPreOrder = 0 THEN ii.quantity ELSE 0 END) AS satis,
      SUM(CASE WHEN i.type = 'IADE' AND ii.isChinaReturn = 0 THEN ii.quantity ELSE 0 END) AS iade
    FROM teknikerp.InvoiceItem ii
    JOIN teknikerp.Invoice i ON i.id = ii.invoiceId
    WHERE i.deletedAt IS NULL
    GROUP BY ii.productId
  ) h ON h.productId = p.id
  WHERE p.deletedAt IS NULL
) t
WHERE ABS(fark) > 0.001
ORDER BY ABS(fark) DESC, sku
LIMIT 80;
