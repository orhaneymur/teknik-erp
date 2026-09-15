export const APPEARANCE_OPTIONS = [
  { value: 'CITALI', label: 'Çıtalı' },
  { value: 'CITASIZ', label: 'Çıtasız' },
] as const;

/** Stok kartı renk önerileri — yazılabilir typeahead */
export const COLOR_OPTIONS = [
  'Siyah',
  'Beyaz',
  'Gri',
  'Gümüş',
  'Altın',
  'Rose Gold',
  'Kırmızı',
  'Mavi',
  'Lacivert',
  'Yeşil',
  'Turkuaz',
  'Sarı',
  'Turuncu',
  'Pembe',
  'Mor',
  'Kahverengi',
  'Şeffaf',
  'Grafit',
  'Midnight',
  'Starlight',
] as const;

export const QUALITY_OPTIONS = [
  { value: 'A_KALITE', label: 'A Kalite' },
  { value: 'A_PLUS', label: 'A Plus' },
  { value: 'ORJINAL', label: 'Orjinal' },
  { value: 'REVIZYON_ORJINAL', label: 'Revizyon Orjinal' },
  { value: 'SERVIS_ORJINAL', label: 'Servis Orjinal' },
  { value: 'OLED', label: 'OLED' },
] as const;

export function appearanceLabel(value: string | null | undefined): string {
  if (!value) return '';
  return APPEARANCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function qualityLabel(value: string | null | undefined): string {
  if (!value) return '';
  return QUALITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Ekranda yazılan kalite metnini kayıt değerine çevirir: bilinen 6 etiket
 * koduna ("A Kalite" -> A_KALITE, Excel ile aynı kural), diğerleri olduğu
 * gibi metin ("Cof Orijinal"). Kalite serbest alandır; Excel'den gelen
 * değerler de böyle saklanıyor.
 */
export function qualityValueFromLabel(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const key = trimmed.toLocaleLowerCase('tr-TR');
  const known = QUALITY_OPTIONS.find(
    (o) => o.label.toLocaleLowerCase('tr-TR') === key || o.value === trimmed
  );
  return known ? known.value : trimmed;
}
