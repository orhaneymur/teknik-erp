-- Stok kodu bos olan urunlere otomatik kod (SK000123 bicimi).
-- LEFT JOIN, uretilen kodun baska bir urunde zaten kullanilmadigini garanti eder.
UPDATE `Product` `p`
LEFT JOIN `Product` `q` ON `q`.`sku` = CONCAT('SK', LPAD(`p`.`id`, 6, '0'))
SET `p`.`sku` = CONCAT('SK', LPAD(`p`.`id`, 6, '0'))
WHERE TRIM(`p`.`sku`) = '' AND `q`.`id` IS NULL;

-- Eski Excel semasi rengi ayri kolon yerine aciklamanin sonuna
-- "... | Renk: Black" olarak yaziyordu (v1.8.44'te kaldirildi).
-- Renk bilgisi kendi kolonuna tasinir.
UPDATE `Product`
SET `color` = TRIM(SUBSTRING(`description`, LOCATE('Renk:', `description`) + 5))
WHERE (`color` IS NULL OR TRIM(`color`) = '')
  AND `description` LIKE '%Renk:%'
  AND TRIM(SUBSTRING(`description`, LOCATE('Renk:', `description`) + 5)) <> '';

-- Aciklamadaki artik "| Renk: ..." parcasi temizlenir
UPDATE `Product`
SET `description` = NULLIF(
  TRIM(TRIM(TRAILING '|' FROM TRIM(SUBSTRING(`description`, 1, LOCATE('Renk:', `description`) - 1)))),
  ''
)
WHERE `description` LIKE '%Renk:%';
