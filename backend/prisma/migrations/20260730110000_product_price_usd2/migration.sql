-- Satış 2 (Perakende). Mevcut kayıtlarda Satış 1 ile aynı değer.
ALTER TABLE `Product` ADD COLUMN `priceUsd2` DOUBLE NOT NULL DEFAULT 0;
UPDATE `Product` SET `priceUsd2` = `priceUsd` WHERE `priceUsd2` = 0 AND `priceUsd` > 0;
