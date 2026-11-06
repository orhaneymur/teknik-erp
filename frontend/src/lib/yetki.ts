/**
 * ROL YETKİLERİ — arayüz tarafı.
 *
 * TEK DOĞRU KAYNAK SUNUCUDUR. Bu dosya matrisin kendi kopyasını TUTMAZ;
 * `/api/auth/me` ne derse onu saklar ve sorar. İki kopya olursa biri eskir
 * ve ekran "yapabilirsin" derken sunucu 403 döner — projenin en pahalı
 * hata türü bu (DURUM.md: "aynı şeyin iki kopyası").
 *
 * BURADAKİ GİZLEME KORUMA DEĞİLDİR. Gerçek kapı sunucudaki `onRequest`
 * kancası; burada düğmeyi saklamak yalnızca kullanıcıya yapamayacağı işi
 * göstermemek için. Bu dosya atlatılsa bile uç 403 döner.
 *
 * `tenantConfig.ts` ile aynı kalıp: açılışta bir kez yüklenir, sonra
 * eşzamanlı okunur.
 */
import axios from 'axios';
import { API_BASE } from './api';

export type Yetki = 'oku' | 'yaz' | 'guncelle' | 'sil' | 'aktar';

export type Alan =
  | 'satis'
  | 'alis'
  | 'iade'
  | 'stok'
  | 'musteri'
  | 'tahsilat'
  | 'kasa'
  | 'rapor'
  | 'maliyet'
  | 'ayarlar'
  | 'tanim';

export type OturumYetkisi = {
  rol: string;
  rolAdi: string;
  matris: Partial<Record<Alan, Yetki[]>>;
};

/**
 * Yüklenmeden önceki hal: HİÇBİR YETKİ YOK.
 *
 * Bilerek boş — yüklenirken her şeyi açık varsaymak, ağ hatasında
 * kullanıcıya yetkisi olmayan düğmeleri gösterirdi. Boş başlayıp yükleme
 * bitince açılır.
 */
let mevcut: OturumYetkisi = { rol: '', rolAdi: '', matris: {} };

export async function yetkileriYukle(): Promise<OturumYetkisi> {
  try {
    const res = await axios.get<{
      success: boolean;
      data?: { role: string; roleLabel: string; yetkiler: Record<string, Yetki[]> };
    }>(`${API_BASE}/api/auth/me`);

    if (res.data.success && res.data.data) {
      mevcut = {
        rol: res.data.data.role,
        rolAdi: res.data.data.roleLabel,
        matris: (res.data.data.yetkiler ?? {}) as Partial<Record<Alan, Yetki[]>>,
      };
    }
  } catch {
    /* Oturum düştüyse App zaten giriş ekranına atıyor; yetkiler boş kalır. */
    mevcut = { rol: '', rolAdi: '', matris: {} };
  }
  return mevcut;
}

export function yetkileriTemizle(): void {
  mevcut = { rol: '', rolAdi: '', matris: {} };
}

export function oturumYetkisi(): OturumYetkisi {
  return mevcut;
}

export function yetkiVar(alan: Alan, yetki: Yetki): boolean {
  return mevcut.matris[alan]?.includes(yetki) ?? false;
}
