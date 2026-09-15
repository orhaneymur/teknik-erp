import { BadgeCheck } from 'lucide-react';

/**
 * Kayıtlı bir fiş yeniden açıldığında Fatura Özeti'nin üstünde duran rozet.
 *
 * Müşteri isteği (16 Eylül 2026): kaydedilmiş fişe tekrar girince ekran
 * yeni fiş gibi görünüyordu, "bu kaydedildi mi?" belli olmuyordu. Rozet
 * yalnızca bilgi verir — düzenleme ve Kaydet aynen çalışır.
 */
export default function KayitliFisRozeti({
  fisNo,
  tarih,
}: {
  fisNo: string;
  /** "YYYY-MM-DD" ya da gösterime hazır metin; boşsa yazılmaz */
  tarih?: string;
}) {
  if (!fisNo) return null;
  const tarihMetni =
    tarih && /^\d{4}-\d{2}-\d{2}$/.test(tarih)
      ? tarih.split('-').reverse().join('.')
      : tarih;
  return (
    <div
      role="status"
      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-center print:hidden"
    >
      <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800">
        <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
        Kayıtlı fiş
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-900">
        {fisNo}
        {tarihMetni ? <span className="font-normal text-emerald-700"> · {tarihMetni}</span> : null}
      </p>
      <p className="mt-0.5 text-caption text-emerald-700">
        Değişiklik yapıp Kaydet'e basınca bu fiş güncellenir
      </p>
    </div>
  );
}
