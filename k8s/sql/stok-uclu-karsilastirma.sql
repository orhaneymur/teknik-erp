-- UCLU STOK KARSILASTIRMASI — provada (tenant-shenzhen-test)
--
--   excel_1109  : 11 Eylul 19:01'de sistemden indirilen Excel (yedek1209.excel_1109)
--   yedek1209   : 12 Eylul 03:00 gece yedegi = ilk yuklemeden HEMEN SONRA
--   teknikerp   : canlinin guncel kopyasi
--
-- Eslesme once stok koduyla, kod tutmazsa urun adiyla (yukleme kodlari
-- yeniden uretmis olabilir). Sorular:
--   1. Excel'deki stok 12 Eylul yedeginde var mi?  (yok -> yuklemede kaybolmus)
--   2. 12 Eylul'den bugune hareketlerle aciklanabiliyor mu?
--
-- Calistirma (tek satir):
--   kubectl exec -i -n tenant-shenzhen-test deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -t' < k8s/sql/stok-uclu-karsilastirma.sql

-- Ozet
SELECT
  COUNT(*)                                        AS excel_stoklu_urun,
  SUM(e.bakiye)                                   AS excel_adet,
  SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END)   AS sistemde_bulunamayan,
  SUM(IFNULL(y.quantity,0))                       AS yedek1209_adet,
  SUM(IFNULL(s.quantity,0))                       AS simdiki_adet,
  SUM(CASE WHEN ABS(e.bakiye - IFNULL(y.quantity,0)) > 0.001 THEN 1 ELSE 0 END) AS yuklemede_farkli_urun,
  SUM(e.bakiye - IFNULL(y.quantity,0))            AS yuklemede_kaybolan_adet
FROM yedek1209.excel_1109 e
LEFT JOIN teknikerp.Product p ON p.deletedAt IS NULL AND (p.sku = e.sku OR (p.name = e.ad AND NOT EXISTS (SELECT 1 FROM teknikerp.Product q WHERE q.sku = e.sku AND q.deletedAt IS NULL)))
LEFT JOIN teknikerp.Branch b ON b.name = 'MERKEZ_DEPO'
LEFT JOIN yedek1209.ProductStock y ON y.productId = p.id AND y.branchId = b.id
LEFT JOIN teknikerp.ProductStock s ON s.productId = p.id AND s.branchId = b.id;

-- Urun urun: Excel != yedek olanlar (yuklemede kaybolanlar), en buyuk fark once
SELECT e.sku AS excel_kod, p.sku AS sistem_kod, LEFT(e.ad, 40) AS urun,
  e.bakiye AS excel_1109,
  IFNULL(y.quantity,0) AS yedek_1209,
  e.bakiye - IFNULL(y.quantity,0) AS yuklemede_kayip,
  IFNULL(s.quantity,0) AS simdiki
FROM yedek1209.excel_1109 e
LEFT JOIN teknikerp.Product p ON p.deletedAt IS NULL AND (p.sku = e.sku OR (p.name = e.ad AND NOT EXISTS (SELECT 1 FROM teknikerp.Product q WHERE q.sku = e.sku AND q.deletedAt IS NULL)))
LEFT JOIN teknikerp.Branch b ON b.name = 'MERKEZ_DEPO'
LEFT JOIN yedek1209.ProductStock y ON y.productId = p.id AND y.branchId = b.id
LEFT JOIN teknikerp.ProductStock s ON s.productId = p.id AND s.branchId = b.id
WHERE ABS(e.bakiye - IFNULL(y.quantity,0)) > 0.001
ORDER BY ABS(e.bakiye - IFNULL(y.quantity,0)) DESC, e.sku
LIMIT 60;
