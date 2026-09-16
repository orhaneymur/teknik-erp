-- GERI ALMA: kasa-hareket-tamamla.sql'in tersi
-- Eklenen 22 "duzenleme farki (eski surum)" hareketini siler. Kasa
-- bakiyesine dokunmaz (o hareketler eklenirken de dokunulmamisti).
SELECT COUNT(*) AS silinecek FROM Transaction WHERE receiptNo IS NULL AND description LIKE '% düzenleme farkı (eski sürüm)';
DELETE FROM Transaction WHERE receiptNo IS NULL AND description LIKE '% düzenleme farkı (eski sürüm)';
SELECT ROW_COUNT() AS silinen;
