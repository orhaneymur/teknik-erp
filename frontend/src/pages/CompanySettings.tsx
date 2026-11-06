import { useEffect, useState } from 'react';
import axios from 'axios';
import { Building2, Info } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { getTenantConfig } from '../lib/tenantConfig';
import { useExchangeRates } from '../hooks/useExchangeRates';

/**
 * FİRMA BİLGİLERİ — Site Ayarları'nın ilk sayfası.
 *
 * Şu an SALT OKUNUR. Sebebi mimari, eksiklik değil: bu değerlerin tek doğru
 * kaynağı Kubernetes ConfigMap'idir (`/config.json` olarak nginx'e mount
 * edilir). SaaS modelinin dayandığı nokta bu — tek imaj tüm müşterilere
 * hizmet eder, firmaya özel hiçbir şey imajın içinde değildir (bkz. SAAS.md).
 *
 * Ekrandan düzenlenebilir olması için değerlerin veritabanına taşınması ve
 * yeni müşteri açma yordamının değişmesi gerekir; ayrı bir karar, ayrı bir
 * sürüm. O yapılana kadar bu sayfanın işi: bugüne dek yalnızca `kubectl` ile
 * görülebilen ayarları ekrana getirmek ve her birinin NEREDEN değiştiğini
 * yazmak.
 */

type SatirProps = {
  etiket: string;
  deger?: string | null;
  /** Değer boşsa gösterilecek metin — "tanımlı değil" gibi */
  bosMetin?: string;
  ipucu?: string;
};

function Satir({ etiket, deger, bosMetin = 'Tanımlı değil', ipucu }: SatirProps) {
  const dolu = typeof deger === 'string' && deger.trim().length > 0;
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-full text-xs font-medium text-slate-500 sm:w-56 sm:shrink-0">
        {etiket}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            dolu ? 'text-sm font-semibold text-slate-800' : 'text-sm italic text-slate-400'
          }
        >
          {dolu ? deger : bosMetin}
        </span>
        {ipucu && <span className="mt-0.5 block text-[11px] text-slate-400">{ipucu}</span>}
      </span>
    </div>
  );
}

function Kart({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800">{baslik}</h3>
      <p className="mt-0.5 mb-2 text-xs text-slate-500">{aciklama}</p>
      {children}
    </section>
  );
}

export default function CompanySettings() {
  const tenant = getTenantConfig();
  const { rates } = useExchangeRates();
  const [apiVersion, setApiVersion] = useState<string | null>(null);

  const arayuzSurumu =
    (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || 'dev';

  useEffect(() => {
    let iptal = false;
    void axios
      .get<{ success: boolean; data: { version: string } }>(`${API_BASE}/api/version`)
      .then((r) => {
        if (!iptal && r.data.success) setApiVersion(r.data.data.version);
      })
      .catch(() => {
        if (!iptal) setApiVersion(null);
      });
    return () => {
      iptal = true;
    };
  }, []);

  /* Tarayıcının gerçek saat dilimi — sunucu Europe/Istanbul'a sabit. */
  const tarayiciSaatDilimi =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'bilinmiyor';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-700 p-2.5 text-white">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Firma Bilgileri</h2>
          <p className="text-xs text-slate-500">
            Bu kurulumun firma kimliği, yerel ayarları ve sürümü
          </p>
        </div>
      </div>

      <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <p className="text-xs leading-relaxed text-sky-900">
          Bu sayfa <strong>salt okunurdur.</strong> Değerlerin tek doğru kaynağı
          sunucudaki ayar dosyasıdır (Kubernetes ConfigMap); tek bir uygulama kopyası
          bütün müşterilere hizmet ettiği için firma bilgisi uygulamanın içinde
          tutulmaz. Değişiklik gerektiğinde sunucudan yapılır ve uygulama yeniden
          derlenmez. Ekrandan düzenlenebilmesi ayrı bir çalışma — aşağıdaki
          “Tanımlı değil” satırları da o adımda açılacak alanlardır.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Kart
          baslik="Firma Kimliği"
          aciklama="Ekranlarda, fişlerde ve barkod etiketlerinde görünen bilgiler"
        >
          <Satir etiket="Firma adı" deger={tenant.companyName} />
          <Satir
            etiket="Tarayıcı sekmesi başlığı"
            deger={tenant.documentTitle}
            ipucu="Satış, alış ve iade ekranlarında seçilen müşterinin adıyla değişir"
          />
          <Satir
            etiket="Fiş iletişim satırı"
            deger={tenant.companyContact}
            bosMetin="Boş — fişe iletişim satırı basılmaz"
          />
          <Satir
            etiket="Müşteri kodu (namespace)"
            deger={tenant.tenantId}
            ipucu="Sunucudaki kurulumun kısa adı"
          />
          <Satir etiket="Yasal ünvan" bosMetin="Tanımlı değil" />
          <Satir etiket="Vergi dairesi" bosMetin="Tanımlı değil" />
          <Satir etiket="Vergi numarası" bosMetin="Tanımlı değil" />
          <Satir etiket="Resmî adres" bosMetin="Tanımlı değil" />
        </Kart>

        <Kart baslik="Markalaşma" aciklama="Fişin üstüne basılan logo">
          {tenant.logoUrl ? (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <img
                src={tenant.logoUrl}
                alt="Firma logosu"
                className="max-h-20 max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="mb-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">
              Logo tanımlı değil — fişte logo alanı hiç çizilmez
            </div>
          )}
          <Satir
            etiket="Logo kaynağı"
            deger={
              tenant.logoUrl
                ? tenant.logoUrl.startsWith('data:')
                  ? 'Ayar dosyasına gömülü (data:image)'
                  : tenant.logoUrl
                : ''
            }
            bosMetin="Tanımlı değil"
            ipucu="Termal yazıcı 1 bit basar: saf siyah-beyaz, ~512 piksel genişlikte PNG verilmeli"
          />
          <Satir etiket="Giriş ekranı görseli" bosMetin="Tanımlı değil" />
          <Satir etiket="Favicon" bosMetin="Tanımlı değil — uygulamanın varsayılanı kullanılır" />
        </Kart>

        <Kart
          baslik="Yerel Ayarlar"
          aciklama="Para birimi, saat dilimi ve biçimler"
        >
          <Satir
            etiket="Tutar para birimi"
            deger="USD (dolar)"
            ipucu="Koda gömülüdür: bakiye, kâr ve raporlar dolar üzerinden işler. Fişteki TL karşılığı yalnızca gösterimdir"
          />
          <Satir
            etiket="Ayar dosyasındaki para birimi"
            deger={tenant.currency}
            ipucu="Yalnızca kasa etiketlerinde kullanılır; tutarların tabanını değiştirmez"
          />
          <Satir
            etiket="Saat dilimi (sunucu)"
            deger="Europe/Istanbul"
            ipucu="Koda gömülüdür. Raporların gün sınırları ve fiş numaraları buna bağlıdır"
          />
          <Satir etiket="Saat dilimi (bu tarayıcı)" deger={tarayiciSaatDilimi} />
          <Satir etiket="Tarih biçimi" deger="GG.AA.YYYY (tr-TR)" />
          <Satir etiket="Sistem dili" deger="Türkçe" ipucu="Tek dil desteklenir" />
          <Satir
            etiket="Excel dosya etiketi"
            deger={tenant.fileTag}
            bosMetin="Boş — firma adından türetilir"
            ipucu="İndirilen dosya adlarının başına eklenir"
          />
        </Kart>

        <Kart baslik="Sürüm ve Kur Kaynağı" aciklama="Çalışan sürümler ve canlı döviz kuru">
          <Satir etiket="Sunucu (API) sürümü" deger={apiVersion} bosMetin="Okunamadı" />
          <Satir etiket="Arayüz sürümü" deger={arayuzSurumu} />
          <Satir
            etiket="Kur kaynağı"
            deger={rates.source}
            ipucu="Firma farkı bu yazının içindedir — ör. “Harem +0,20”"
          />
          <Satir
            etiket="1 USD"
            deger={`${rates.usd.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })} TL`}
          />
          <Satir
            etiket="1 EUR"
            deger={`${rates.eur.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })} TL`}
          />
          {rates.uyari ? (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Kur uyarısı:</strong> {rates.uyari}
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Kur güncel — uyarı yok.
            </div>
          )}
        </Kart>
      </div>
    </div>
  );
}
