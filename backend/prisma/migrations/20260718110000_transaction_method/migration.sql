-- Kasa hareketi: Ödeme yöntemi (Nakit / Kredi Kartı / EFT-Havale)
ALTER TABLE `Transaction` ADD COLUMN `method` VARCHAR(191) NULL;
