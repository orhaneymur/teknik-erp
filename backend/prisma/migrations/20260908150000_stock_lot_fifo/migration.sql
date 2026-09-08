-- FIFO stok katmanlari
--
-- Her alis kendi birim maliyetiyle bir katman acar; satis en eski
-- katmandan tuketir. Onceden urunun tek bir costPrice alani vardi ve her
-- alis onu son alis fiyatina esitliyordu; eldeki eski, ucuz mal da yeni
-- fiyattan degerleniyordu.

CREATE TABLE `StockLot` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `productId` INTEGER NOT NULL,
  `branchId` INTEGER NOT NULL,
  `quantity` DOUBLE NOT NULL,
  `unitCost` DOUBLE NOT NULL,
  `sourceInvoiceItemId` INTEGER NULL,
  `isOpening` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `StockLot_productId_branchId_createdAt_idx` (`productId`, `branchId`, `createdAt`),
  INDEX `StockLot_sourceInvoiceItemId_idx` (`sourceInvoiceItemId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StockLot`
  ADD CONSTRAINT `StockLot_productId_fkey`
  FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `StockLot`
  ADD CONSTRAINT `StockLot_branchId_fkey`
  FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Satis aninda dondurulan birim maliyet.
-- NULL = bu alan eklenmeden once olusmus kayit; raporlar o durumda
-- urunun guncel costPrice'ina duser.
ALTER TABLE `InvoiceItem` ADD COLUMN `unitCost` DOUBLE NULL;

-- Mevcut stok icin ACILIS KATMANLARI.
--
-- Surume gecerken elde ne varsa, urunun o anki costPrice'iyla tek bir
-- katman olarak acilir. Gecmis alis fiyatlari kayitlarda tek tek
-- tutulmadigi icin daha iyisi yapilamaz; bundan sonraki her alis kendi
-- katmanini acacak.
-- Yalnizca POZITIF stok icin: eksi stok bir katman degildir.
INSERT INTO `StockLot` (`productId`, `branchId`, `quantity`, `unitCost`, `isOpening`, `createdAt`)
SELECT ps.`productId`, ps.`branchId`, ps.`quantity`, COALESCE(p.`costPrice`, 0), true, NOW(3)
FROM `ProductStock` ps
JOIN `Product` p ON p.`id` = ps.`productId`
WHERE ps.`quantity` > 0;

-- Gecmis SATIS satirlarinin maliyetini, urunun o anki costPrice'iyla
-- dondur. Ideal degil (gercek alis fiyati bilinmiyor) ama alternatifi
-- raporlarin gecmise donuk oynamaya devam etmesi.
UPDATE `InvoiceItem` ii
JOIN `Invoice` i ON i.`id` = ii.`invoiceId`
JOIN `Product` p ON p.`id` = ii.`productId`
SET ii.`unitCost` = p.`costPrice`
WHERE i.`type` = 'SATIS' AND ii.`unitCost` IS NULL;
