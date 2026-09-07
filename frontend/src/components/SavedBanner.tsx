import { CheckCircle } from 'lucide-react';

/**
 * Fatura kaydedildikten sonra ekranın üstünde duran yeşil onay şeridi.
 *
 * Kayıttan sonra sayfadan çıkılmıyor (kullanıcı fişi kontrol edip kendisi
 * çıkıyor). Köşede bir kaç saniye görünüp kaybolan bildirim bu akışta
 * gözden kaçtığı için onay, fişin hemen üstünde ve kalıcı duruyor.
 */
export default function SavedBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm print:hidden"
    >
      <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
      <span>{message}</span>
    </div>
  );
}
