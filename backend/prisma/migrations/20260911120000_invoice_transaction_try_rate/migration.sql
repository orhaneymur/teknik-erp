-- Fiş üzerinde TL karşılığı yazabilmek için kaydedilen USD satış kuru.
--
-- YALNIZCA GÖSTERİM İÇİNDİR. Tutarlar USD'dir; bakiye, kâr ve ciro
-- raporları bu alandan hesaplanmaz.
--
-- Mevcut `exchangeRate` alanına yazılamazdı: o alan
-- `totalAmountUsd = totalAmountTl / exchangeRate` dönüşümünü tanımlar ve
-- her zaman 1'dir (adına rağmen `totalAmountTl` USD tutar taşır, cari
-- bakiye de bu alandan işler). Oraya gerçek kur yazılsaydı USD tutarlar
-- kur katı kadar küçülür, raporlar sessizce bozulurdu.
--
-- NULL kalan kayıtlar sürüm öncesine aittir; fişlerinde TL satırı basılmaz.
ALTER TABLE `Invoice` ADD COLUMN `tryRate` DOUBLE NULL;
ALTER TABLE `Transaction` ADD COLUMN `tryRate` DOUBLE NULL;
