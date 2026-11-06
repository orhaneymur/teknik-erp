-- ROL BAZLI YETKI + DENETIM KAYDI — 6 Kasim 2026
--
-- 1) User.isActive: isten ayrilan personel pasife alinir, kayit silinmez
--    (gecmis faturalar userId ile ona isaret ediyor).
-- 2) Eski "staff" rolu "satis"a cevrilir. O rol fiilen SINIRSIZDI; artik
--    maliyet/kar gormez ve fis silemez. Amac buydu.
-- 3) AuditLog: para ve silme islemlerinin salt okunur izi.

ALTER TABLE `User` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `User` MODIFY COLUMN `role` VARCHAR(191) NOT NULL DEFAULT 'satis';
CREATE INDEX `User_isActive_idx` ON `User`(`isActive`);

UPDATE `User` SET `role` = 'satis' WHERE `role` IN ('staff', 'personel', '');
UPDATE `User` SET `role` = 'admin' WHERE `role` IN ('yonetici', 'administrator');

CREATE TABLE `AuditLog` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NULL,
  `userName` VARCHAR(191) NOT NULL,
  `userRole` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `entity` VARCHAR(191) NULL,
  `entityId` VARCHAR(191) NULL,
  `summary` TEXT NOT NULL,
  `oncesi` TEXT NULL,
  `sonrasi` TEXT NULL,
  `ip` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditLog_createdAt_idx`(`createdAt`),
  INDEX `AuditLog_userId_idx`(`userId`),
  INDEX `AuditLog_action_idx`(`action`),
  INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
