-- Ürün çöp kutusu.
--
-- Ürün kaydı silinmez, gizlenir: geçmiş faturalar ürüne işaret ettiği
-- için silinirse o faturalar ürün adını kaybeder ve okunamaz hale gelir.
-- Gizlenen ürün hiçbir listede görünmez ama faturalarda ve raporlarda
-- aynen kalır.
--
-- Hiç faturada geçmemiş ürün çöp kutusundan kalıcı silinebilir; faturası
-- olan silinemez (uygulama tarafında kontrol edilir).
ALTER TABLE `Product` ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE INDEX `Product_deletedAt_idx` ON `Product`(`deletedAt`);

-- Çin iade deposundaki SIFIR stok kayıtlarını temizle.
--
-- Excel yüklemesi CinIade sütunu varken 0 bile olsa kayıt açıyordu;
-- binlerce boş satır birikiyor ve depo listesi okunmaz hale geliyordu.
-- Yalnızca gerçekten iade edilmiş mal orada dursun.
DELETE ps FROM `ProductStock` ps
JOIN `Branch` b ON b.`id` = ps.`branchId`
WHERE b.`name` IN ('CIN_IADE_DEPO', 'ARIZALI_DEPO')
  AND ps.`quantity` = 0;
