/**
 * Sayı alanlarında fare tekerleğinin değeri değiştirmesini engeller.
 *
 * Tarayıcılar, odaktaki bir `<input type="number">` üzerinde tekerlek
 * çevrildiğinde değeri artırıp azaltır. Satış sepetinde adet kutusunda
 * duran kullanıcı sayfayı kaydırmak isterken adedi 1'den 1,2'ye çeviriyordu
 * ve bunu fark etmiyordu.
 *
 * Çözüm: tekerlek olayı yakalama (capture) aşamasında alanın odağını
 * kaldırıyoruz. Tarayıcı odaksız alanda değer değiştirmediği için sayı
 * sabit kalır; olay engellenmediği için sayfa normal şekilde kaymaya
 * devam eder.
 *
 * Tek tek `onWheel` eklemek yerine burada toplu çözülmesinin sebebi:
 * arayüzde 28 sayı alanı var ve ileride eklenecek her yeni alan da
 * ek bir iş gerektirmeden korunmuş olur.
 */
export function guardNumberInputsFromWheel(): void {
  document.addEventListener(
    'wheel',
    () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === 'number') {
        active.blur();
      }
    },
    // capture: tarayıcının varsayılan davranışından ÖNCE çalışsın
    // passive: olayı engellemiyoruz, sayfa kaymaya devam etsin
    { capture: true, passive: true }
  );
}
