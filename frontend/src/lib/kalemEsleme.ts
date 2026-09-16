/**
 * Sunucudan dönen fatura kalemlerini ekrandaki satırlara bağlar.
 *
 * Kayıt (POST) ve güncelleme (PUT) sonrası, henüz sunucu id'si olmayan
 * satırlar aynı ürünün henüz sahiplenilmemiş kalemleriyle SIRAYLA eşlenir.
 * Eşlenmeyen satır bir sonraki Kaydet'te "yeni kalem" olarak tekrar gider
 * ve fişe ikinci kez yazılır — 17 Eylül 2026 iade olayı: personel fişi
 * kaydedip ürün ekleyip yeniden kaydettikçe önceki eklemeler katlanıyordu.
 * Güncelleme yanıtı ekrana hiç işlenmiyordu.
 *
 * Saf fonksiyon: aynı girdiyle kaç kez çağrılırsa çağrılsın aynı sonucu
 * verir, girdiyi değiştirmez; React güncelleyicisi içinde güvenle kullanılır.
 */
export function kalemIdleriniEsle<T>(
  satirlar: T[],
  kalemler: ReadonlyArray<{ id: number; productId: number }> | null | undefined,
  idOku: (satir: T) => number | null | undefined,
  urunOku: (satir: T) => number,
  idYaz: (satir: T, id: number) => T
): T[] {
  if (!Array.isArray(kalemler) || kalemler.length === 0) return satirlar;

  // Ekranda zaten bağlı olan kalemler havuza girmez
  const bagli = new Set<number>();
  for (const satir of satirlar) {
    const id = idOku(satir);
    if (typeof id === 'number' && id > 0) bagli.add(id);
  }

  const havuz = new Map<number, number[]>();
  for (const kalem of kalemler) {
    if (bagli.has(kalem.id)) continue;
    const liste = havuz.get(kalem.productId) ?? [];
    liste.push(kalem.id);
    havuz.set(kalem.productId, liste);
  }

  return satirlar.map((satir) => {
    const mevcut = idOku(satir);
    if (typeof mevcut === 'number' && mevcut > 0) return satir;
    const liste = havuz.get(urunOku(satir));
    const kalemId = liste?.shift();
    return kalemId ? idYaz(satir, kalemId) : satir;
  });
}
