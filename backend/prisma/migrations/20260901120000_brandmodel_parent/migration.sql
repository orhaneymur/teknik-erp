-- Model -> Marka bagi.
--
-- Modeller bagli olduklari markayi gostersin diye BrandModel kendine
-- referans veren bir alan kazanir. MARKA kayitlarinda bos kalir.
--
-- Marka silinirse model sahipsiz kalir (SET NULL); model silinmez, cunku
-- urun kartlari modele bagli.
--
-- Mevcut kayitlar etkilenmez: kolon NULL kabul eder, varsayilani yok.
ALTER TABLE `BrandModel` ADD COLUMN `parentId` INTEGER NULL;

ALTER TABLE `BrandModel`
  ADD CONSTRAINT `BrandModel_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `BrandModel`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
