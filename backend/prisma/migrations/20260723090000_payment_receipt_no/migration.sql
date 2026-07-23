-- Cari tahsilat/tediye icin faturalardan bagimsiz fis no serisi (ODM-YYYY-0001)
ALTER TABLE `Transaction` ADD COLUMN `receiptNo` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Transaction_receiptNo_key` ON `Transaction`(`receiptNo`);
