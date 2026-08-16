-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `dueDate` DATETIME(3) NULL,
    ADD COLUMN `isPreOrder` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `orderNotes` TEXT NULL,
    ADD COLUMN `paymentType` VARCHAR(191) NULL,
    ADD COLUMN `processedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `InvoiceItem` ADD COLUMN `discountPercent` DOUBLE NOT NULL DEFAULT 0;
