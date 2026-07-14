const ISTANBUL_TZ = 'Europe/Istanbul';

/** Fatura kayıt zamanı: seçilen tarih + İstanbul'daki şu anki saat */
export function buildInvoiceCreatedAt(invoiceDate?: string): Date {
  const datePart =
    invoiceDate?.trim() ||
    new Intl.DateTimeFormat('en-CA', { timeZone: ISTANBUL_TZ }).format(new Date());

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISTANBUL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const pick = (type: string) =>
    timeParts.find((part) => part.type === type)?.value.padStart(2, '0') ?? '00';

  return new Date(
    `${datePart}T${pick('hour')}:${pick('minute')}:${pick('second')}+03:00`
  );
}

/**
 * Fiş no: YYMMDDHHmmss (İstanbul) — örn. 260715011406
 * offsetSeconds çakışma durumunda saniye kaydırmak için kullanılır.
 */
export function formatTimestampInvoiceNo(
  date: Date = new Date(),
  offsetSeconds = 0
): string {
  const source = new Date(date.getTime() + offsetSeconds * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISTANBUL_TZ,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(source);

  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value.padStart(2, '0') ?? '00';

  return `${pick('year')}${pick('month')}${pick('day')}${pick('hour')}${pick('minute')}${pick('second')}`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
