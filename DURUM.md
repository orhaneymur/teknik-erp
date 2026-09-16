# Durum ve Devam Notu

Son güncelleme: **17 Eylül 2026**

Bu belge "nerede kaldık, sırada ne var" sorusunu cevaplar. Yeni bir
oturuma başlarken önce buraya bak.

---

## 0. TAM ŞU AN NEREDE KALDIK

> **CANLI v1.22.21 — 16 Eylül 2026 19:08 (Türkiye), kapanıştan sonra.**
> Prova da v1.22.21. Yedek: `/root/prova-kaynak-shenzhen-20260916-1559.sql.gz`
> (399 fatura, 300 hareket). Sıra: prova tazele → prova sürüm → prova
> temizlik → canlı sürüm → canlı temizlik (7 fiş, `fazla-kalem-temizle.sh`)
> → doğrulama. **Sonuç:** kopya kalem 0; cari mutabakat 220 müşteri fark 0
> (26.024,52); ERSA 260915094213 → 17.048,25 / 249 kalem, bakiye 8.616,21
> değişmedi (ön sipariş); MARTEK bakiyesi 2.691 → 2.899,50 (+96,50 +112);
> dört küçük alış fişi birer kalem. 101 fazla kalem silindi.
>
> **Excel indir-yükle turu YAPILDI (19:30–19:45):** iki kez koştu (ekran
> ikisinde de "yüklenemedi" dedi, sunucu günlüğü ikisinde de `bitti: 0
> yeni, 5440 güncellendi`). Katman = stok: 5440 üründe ayrışan 33, hepsi
> **eksi stoklu** (toplam −88 adet; BAT00102 −10, EKR00461 −9…) — katman
> eksiye inemez, beklenen istisna; alış girildikçe düzelir.
>
> **Sonraya kalan:** (1) **Ekran hatası:** Excel yüklemede "dosya
> ayrıştırılıyor" aşaması 72 sn boyunca olay döngüsünü kilitliyor, durum
> sorgusu zaman aşımına düşüyor, ekran bunu "yüklenemedi" sayıp sormayı
> bırakıyor (günlükte iş başına 2 durum sorgusu var, 2 sn'de bir değil).
> Düzeltme: zaman aşımı hata değil, sormaya devam; ayrıştırmayı da parça
> parça `setImmediate` ile böl. (2) ERSA'da EKR00273 3 mü 5 mi — müşteriye
> sor, fiş düzenlemeden tek satır sil; **Stok Düş'ten önce**. (3) 33 eksi
> stoklu ürün listesi müşteriye. (4) 25 kalemin boş maliyeti (SQL aşağıda).
> (5) "Eski kodları düzelt" düğmesi. (6) Fiziksel kasa sayımı 14.579,47 $.
>
> Bu gecenin sürümleri: v1.22.17 katlanma düzeltmesi (müşteri şikâyeti),
> v1.22.18 fiş sırası, v1.22.19 PDF adları, v1.22.20 açık pencere çıktıya
> girmez, v1.22.21 anasayfada Yazdır (dördü Orhan'ın isteği).
>
> **CANLI v1.22.16 — 17 Eylül 2026 03:45 (Türkiye).** Prova da v1.22.16.
> Müşteri "canlıya geçelim" dedi; beş adım sırayla uygulandı, her biri
> provadakiyle birebir çıktı:
> 1. Yedek: `/root/prova-kaynak-shenzhen-20260916-0041.sql.gz` (291 fatura, 214 hareket)
> 2. 22 eksik kasa hareketi yazıldı → kasa bakiyesi = hareket toplamı
> 3. 3 hareketin müşteri etiketi fişe eşitlendi → cari mutabakatı 216/216, fark 0
> 4. v1.22.16 kuruldu; migration `transaction_kasasiz` uygulandı (00:44:30 UTC)
> 5. 49 açılış kaydı kasasız yapıldı → **kasa 14.579,47 $**, hareket toplamı aynı
>
> **Kalan (müşteri onayıyla):** 25 kalemin boş maliyeti (aşağıda tek satır
> SQL), Excel indir-yükle turu (58 ürünün katmanı), "Eski kodları düzelt"
> düğmesi (müşteri listesinde, canlıda henüz basılmadı). Stok eksiği doğru
> Excel bekliyor. Fiziksel kasa sayımı 14.579 ile karşılaştırılacak.

### Yapıldı (16–17 Eylül gecesi) — v1.22.6 … v1.22.16 tek gecede

Sürüm sürüm ayrıntı aşağıda. Kısa liste: raporlarda ürün bazlı satış ve
fiş listesi; anasayfa kasa kartı, bugün fiş/adet, düzenlenen fiş üstte,
Ana Sayfa aynı sekme; kayıtlı fiş rozeti; ödeme onay penceresi; kalite
yazılabilir; F8 maliyet düzeltmesi; ekstrede TL ile düzenleme, PDF adı,
nakit fiş tek satır, çizgiler; stok hareketlerinde mevcut stok, Düzenle,
toplam giriş/çıkış (Excel dahil); kayıt sonrası bakiye tazeleme; alışta
yeni satır; yön tuşları; fatura listesinde Yazdır; ön sipariş rakamlara
girmiyor ve iade edilemiyor; Kâr-Zarar silinen/iskonto; **kasasız cari
kaydı** (şema değişikliği) ve **kasa raporu sadeleşti**; canlı veri
düzeltmeleri (22 hareket, 3 etiket, 49 açılış kaydı).

### Yapıldı (14–15 Eylül)

**İlk üç günün denetimi (14 Eylül).** Cumartesi 67 satış + 1 iade
(11.413 $), Pazar kapalı, Pazartesi öğlene kadar 29 satış. Silinen fiş
yok, kursuz fiş yok, mükerrer fiş yok, TL tahsilat kuruşuna doğru
(10.000 TL → 205,89 $, kur 48,57). Harem akışı 72 saatte bir kez kopup
kendiliğinden bağlanmış. Alış hiç kesilmemiş. Denetimin ortaya
çıkardığı üç sorun ve karşılıkları aşağıda.

**Çalışma düzeni kuruldu.** Üç katman:

| Katman | Veri | Ne için |
|---|---|---|
| Yerel (`cd backend && npm test`) | Betiğin ürettiği | Para/stok hesabına dokunan her değişiklik önce burada |
| Prova (`test.shenzhenmarket.com.tr`) | Canlının kopyası: `bash k8s/prova-tazele.sh shenzhen` | Gerçek veriyle ekrandan deneme |
| Canlı | — | Provada onaylanan sürüm |

`npm test` (`backend/test/kos.sh`): yerel MySQL kabını kendisi kurar,
**her betiği boş veritabanında** koşar, gerekince backend'i başlatıp
kapatır. 10 betik, 90+ kontrol. İki tuzağı var ve ikisi de yaşandı:
üst üste koşulan betiğin artığı "ikinci fatura açıldı" diye yanıltıcı
KALDI verdi (boş tablo kuralı bunun için); port 3000'de kalmış eski bir
backend'e karşı test koşuldu, yeni uç 404 verdi (koşucu artık dolu porta
başlamayı reddediyor).

`prova-tazele.sh`: canlıyı `mysqldump --single-transaction` ile okur
(kilitlemez), `tenant-<ad>-test`'e yükler, backend'i yeniden başlatır
(bekleyen migration varsa uygulanır), sayımları karşılaştırır. Hedef adı
betiğin içinde `-test` sonekiyle kurulur — **canlıya yazamaz**. Firma
adı, logo, kur farkı ConfigMap'te olduğu için provada "(TEST)" kalır.
Henüz sunucuda çalıştırılmadı.

**v1.22.0 — dört düzeltme** (imajlar Docker Hub'da, provaya kurulmadı):

| # | Sorun | Kaynağı | Ne yapıldı |
|---|---|---|---|
| 1 | **58 üründe stok ile maliyet katmanı ayrışmış** | 14 Eylül denetimi | "Stok Kartı Oluştur" (`POST /api/products`) ve ürün kartındaki stok düzenleme (`PUT /api/products/:id/stock`) stoğu yazıyor ama katman açmıyordu; satışta maliyet varsayılana düşüyordu. İkisi de artık Excel'le aynı `katmanlariStogaEsitle` kuralından geçer. Mevcut 58 ürün için: sürüm kurulunca **sistemden Excel indir, değiştirmeden geri yükle** — yükleme katmanları stoğa eşitler |
| 2 | **Excel'de mükerrer ad uyarısı** | 9 ve 11 Eylül olayları | `POST /api/products/import/excel/kontrol`: dosya yüklemeyle aynı sırayla (Id → StokKodu → yeni) eşleştirilir ama yalnızca sayılır. "Yeni açılacak ama adı mevcut ürünle aynı" satır varsa ekran yüklemeden önce sorar; vazgeçilirse hiçbir şey değişmez. Silme yok, birleştirme yok — yalnızca uyarı. Türkçe i/I tuzağı: `toLocaleUpperCase('tr-TR')` "iph"i "İPH" yapıp "IPH" ile eşleştirmiyordu; üç i de I'ya indiriliyor |
| 3 | **Dolar kasası bakiyesi ile hareket toplamı 1.191 $ ayrışmış** | 14 Eylül denetimi | `reconcileInvoiceFinancials` (fatura düzenleme) kasa bakiyesini değiştiriyor ama hareket yazmıyordu. v1.21.2'nin "tekrar Kaydet aynı fişi günceller" akışında personel kalem ekleyip yeniden kaydedince bakiye artıyor, listede ilk tutar kalıyordu. Artık fark tek hareket olarak yazılır (`<no> düzenleme farkı`); kasa değiştiyse eskisine ters, yenisine düz |
| 4 | `npm test` altyapısı | — | yukarıda |

Doğrulama: `elle-stok-katman-test` (12), `excel-onkontrol-test` (14),
`kasa-hareket-test` (19 — her adımda `Safe.balance == SUM(GIRIS) − SUM(CIKIS)`),
mevcut 7 betik değişmeden geçiyor. `excel-lot-test` yalnızca ekrana
yazıyordu, gerçek kontrol eklendi.

**v1.22.1 — müşterinin üç isteği (15 Eylül):**

| # | İstek | Ne yapıldı |
|---|---|---|
| 1 | Satış fişine ürün eklerken ekranlar en üstte, sonra piller, her kategori kendi içinde alfabetik | F2 sıralaması: kategori (`F2_KATEGORI_ONCELIGI = ['EKR','BAT']`, kalanı alfabetik, kategorisiz sonda) → isabet kademesi (ad/kodda geçen önce) → **doğal** ad sırası (IPH-8 < IPH-11 < IPH-12; düz alfabetik 11'i 8'in önüne koyuyordu). Öncelik listesini genişletmek tek satır |
| 2 | Satış sayfasında dolar toplamının altında TL de yazsın | Net Toplam'ın altına `≈ 12.450,00 TL (1 USD = 48,60 TL)`; fişle aynı kur (`receiptTryRate`), kur yoksa satır çizilmez |
| 3 | Anasayfa "Bugün satış" dünü gösteriyor; haftalık da olsun | Gün anahtarı `toISOString()` (UTC) ile kuruluyordu: yerel 00:00 UTC'de önceki güne düşüyor, anahtar dizisi dünde bitiyor, bugünün satışları hiçbir kovaya girmiyordu. Artık yerel gün (`TZ=Europe/Istanbul`). "Bu hafta satış" kartı: son 7 gün / önceki 7 güne göre |

Doğrulama: `anasayfa-f2-test.ts` (12 kontrol — 00:30'daki satış bugüne
yazılıyor, 15 gün önceki haftaya girmiyor). Koşucu artık `TZ` verir;
Git Bash bunu Windows süreçlerine geçirmez, orada makinenin saat dilimi
(Türkiye, UTC+3) geçerlidir.

**v1.22.2 / v1.22.3 — provada çıkan yükleme sorunu.** Prova v1.22.1'de
5.439 satırlık Excel yüklemesi tarayıcıya hiç "bitti" diyemedi; sunucuda
istek 40 dakika açık kaldı, hiçbir satır yazılmadı (`updatedAt` 0), pod
sağ (RESTARTS 0), MySQL boş, log'da hata yok. Yerelde aynı dosya 57 sn'de
sorunsuz (tepe bellek 396 MB — chart sınırı 256 MB, ama OOM olmadı).
Kesin sebep sunucuda görülemedi; kesinleşen şey **Cloudflare'in 100 sn
sınırı**: dakikalar süren istek o yoldan sonuç döndüremez.

Çözüm mimari: yükleme **arka plana** alındı. `POST …/import/excel` dosyayı
alıp hemen `202 + jobId` döner; iş sunucuda sürer;
`GET …/import/excel/durum/:id` aşama / işlenen / toplam / süre verir. Ekran
2 sn'de bir sorar, "kayıtlar yazılıyor · 1.250 / 5.439 satır · 48 sn"
gösterir, sonucu kalıcı kutuda tutar (v1.22.2'de eklendi; üst bildirim 4
sn'de kaybolduğu için sonuç görülmüyordu). Aynı anda tek yükleme (409).
Sunucu logu `[excel <id>] asama n/m` yazar — bir daha "nerede takıldı"
sorusu kör kalmaz. İş bellekte 1 saat durur; pod yeniden başlarsa durum
404 döner, ekran "sonucu listeden doğrula" der.

Doğrulama: `excel-arkaplan-test.ts` (11 kontrol). Yerelde gerçek boyut
(5.480 satır, 3,6 MB indirilen dosya): boş tabloya 51 sn, dolu tabloya
57 sn, ön kontrol 1,4 sn. Sunucu ~10× yavaş (ön kontrol 13 sn ölçüldü).

> **SAAT TUZAĞI (15 Eylül'de teşhisi saptırdı):** MySQL'de `NOW()`
> Türkiye saati, Prisma'nın yazdığı `createdAt/updatedAt` **UTC**.
> `updatedAt >= NOW() - INTERVAL 1 HOUR` 3 saat ilerideki bir pencereye
> bakar ve **hep 0** verir. Zaman penceresi sorgularında `UTC_TIMESTAMP()`
> kullan; göstermek için `DATE_ADD(createdAt, INTERVAL 3 HOUR)`.
> Prova logu yüklemenin gerçek hızını gösterdi: okuma 3,6 sn, ayrıştırma
> 77 sn, yazma 200 satır / 11 sn → 5.439 satır ≈ 6,5 dk (yerelde 57 sn).
>
> Sunucuda yükleme yine takılırsa log artık nerede durduğunu söyler:
> `kubectl logs -n <ns> deploy/teknikerp-backend --since=1h | grep "\[excel"`

**v1.22.4 — müşteri kodu (müşteri isteği, 15 Eylül).** Yeni müşteri
`M9624233045` gibi kod alıyordu (`index.ts` müşteri ekleme ucu: `M` +
saat damgası + iki rastgele hane); eski sistemde 120, 121, 122 idi. Artık
en büyük sayısal kodun bir fazlası; elle yazılan kod aynen kalır.
Müşteri Listesi'nde yalnızca eski kodlu müşteri varken görünen **"Eski
kodları düzelt (N müşteri)"** düğmesi: oluşturulma sırasıyla seriden
numara verir, sayısal kodlulara dokunmaz, tekrar basılırsa bir şey yapmaz.
Kod yalnızca etikettir — ilişkiler `customerId` ile; fatura, tahsilat,
bakiye değişmez. Hareket açıklamasındaki `<eski kod> cari tahsilat`
etiketi yeni koda çevrilir (metin, tutar değil). `musteri-kodu-test.ts`
(15 kontrol): satış + tahsilat kesilmiş müşterinin kodu değişince bakiye
70 → 70, fatura 1 → 1, hareket 1 → 1, açıklama `187 cari tahsilat`.

**v1.22.5 — ön sipariş tamamlama hatası (kod okunurken bulundu, 15
Eylül).** Müşteri ön sipariş sürecini sordu; `/fulfill` ("Stok Düş —
Ön Siparişi Tamamla") yalnızca stoğu düşürüyor, **FIFO katmanını
tüketmiyor ve kalemin maliyetini yazmıyordu**. Düzenleme yoluyla (kutuyu
kaldırıp Kaydet) dönüştürme doğruydu, düğme değildi. Sonuç: tamamlanan
ön siparişler kâr raporunda maliyetsiz, ürünlerde stok–katman ayrık.
Düzeltildi; `on-siparis-test.ts` (20 kontrol).

Ön sipariş akışı (doğrulanmış): kayıtta stok, cari, kasa, katman
değişmez, ekstrede görünmez, yalnızca Faturalar → Ön Siparişler'de
(kırmızı). Tamamlanınca stok + katman düşer, maliyet yazılır, Cari ise
bakiyeye / nakit ise kasaya işlenir, ekstrede görünür. Tamamlanmış fiş
tekrar tamamlanamaz.

**v1.22.6 — raporlar ve kasa (müşteri isteği, 15 Eylül akşamı).**

| # | İstek / sorun | Ne yapıldı |
|---|---|---|
| 1 | "Tarih aralığında satılan tüm ürünler, yapılan satışlar, satılan ürünler sırayla" | Raporlar → Satış Kırılımı'na iki sekme: **Ürün Bazlı** (ürün, stok kodu, adet, iade adedi, kaç fişte, ciro, kâr, marj; ciro/adet/kâr sırası seçilir) ve **Satış Fişleri** (kayıt sırasıyla tarih, fiş no, müşteri, ödeme, satan, kalem/adet, tutar, kâr; satır açılınca kalemler girildiği sırada; fiş no'ya tıklayınca fiş penceresi). Özet kutularına "Satılan adet" ve fiş/çeşit sayısı eklendi |
| 2 | Anasayfada Kasa **0** görünüyor | Kart yalnızca `currency === 'TRY'` kasaları topluyordu; Shenzhen'in kasası USD etiketli. Artık bütün kasaların toplamı (`Dashboard.tsx`) |
| 3 | "Toplam giriş / çıkış neye göre? Kasaya giren-çıkan para mı, işlem tutarları mı?" | **Kasaya fiilen giren-çıkan para.** Kasa Raporu'nun üstünde açıklama kutusu; her hareket **kaynağına** göre etiketlenip gruplanıyor (satış tahsilatı, cari tahsilat, alış ödemesi, iade ödemesi, cari ödeme, fiş iptali, düzenleme farkı, açılış/eski sistem aktarımı, diğer); kasa başına dönem giriş/çıkış + bugünkü bakiye tablosu; kasa / tip / kaynak süzgeçleri; listeye Tip ve Müşteri sütunu; CSV'ye kaynak ve müşteri. Sınıflandırma sunucuda (`hareketKaynagi`, açıklama metninden — açıklamalar kodda üretilir) |
| 4 | Satış Kırılımı'nda teslim bekleyen ön siparişler ciroya giriyordu | `isPreOrder: false` süzgeci eklendi (kayıtta stok/cari/kasa değişmediği için satış değildir; tamamlanınca girer). **Kategori ve müşteri sekmelerinin rakamı da buna göre değişir** |
| 5 | Rapor tarih penceresi UTC'den başlıyordu | `new Date("2026-09-01")` = Türkiye 03:00; ilk günün 00:00–03:00 fişleri dışarıda kalıyordu. `raporAraligi()` yerel gün alır; ekrandaki tarih kutuları da `yerelGunDizgisi()` (UTC `toISOString` gece yarısından sonra dünü veriyordu) |
| 6 | Satış Kırılımı sayfası yenilenince anasayfaya düşüyordu | `VALID_PAGES` listesinde `report-sales-breakdown` yoktu |

Doğrulama: `rapor-test.ts` (31 kontrol — fiş sırası, kalem sırası, ürün
toplamları, iade adedi, ön sipariş hariç/tamamlanınca dahil, tarih
penceresi, altı kaynak sınıfı, kasa bakiyesi = gerçek bakiye, safeId
süzgeci). Ekrandan henüz bakılmadı — provada bakılacak.

**v1.22.7 — aynı ürün ikinci kez seçilince ayrı kalem açılmasın
(müşteri isteği, 15 Eylül akşamı).** Satış (ön sipariş ve düzenleme de
aynı ekran) ve İade ekranları aynı ürün tekrar seçilince yeni satır
açıyordu; artık mevcut satırın adedi 1 artar ve adet kutusu seçili gelir
(Alış ekranı zaten böyleydi). İadede eşleşme: faturadan gelen satırda
aynı fatura kalemi, elle satırda aynı ürün; "Ayrı kalem" düğmesi
bilerek ayrı satır açmaya devam eder (Çin iade tiki satır bazlı).
Yalnızca ekran davranışı, sunucu değişmedi; `tsc` + `vite build` temiz.

**v1.22.8 — ön sipariş satış rakamlarına giriyordu + iade edilebiliyordu
(müşteri sorusu "ön sipariş bugünün satışına ekleniyor mu?", 15 Eylül
akşamı; ardından "gözden kaçan var mı" denetimi).** Fatura okuyan 20
sorgu tek tek kontrol edildi. Bulgular ve karşılıkları:

| # | Bulgu | Etkisi | Düzeltme |
|---|---|---|---|
| 1 | Anasayfa (bugün/hafta/ay/6 ay grafiği/en çok satan/en iyi müşteri) ve personel cirosu teslim bekleyen ön siparişi **kayıt anında** satış sayıyordu | "Bugün satış" şişik; Satış Kırılımı ile farklı rakam | `SATIS_RAKAMI_FILTER = { deletedAt: null, isPreOrder: false }` — satış toplayan her sorguda |
| 2 | **Kâr-Zarar** silinen fişleri ve ön siparişleri sayıyordu | Silinen satış kârda kalıyordu | Aynı süzgeç |
| 3 | **Kâr-Zarar** iskontoyu yok sayıyordu (`adet × birim fiyat`) | %10 iskontolu 100 $ satış 100 $ ciro / 50 $ kâr görünüyordu (doğrusu 90 / 40) | `satirTutari()` — iskontolu `totalPrice`; Satış Kırılımı zaten öyleydi, ortak yardımcı oldu |
| 4 | **Teslim edilmemiş ön sipariş İADE edilebiliyordu** | Stok hiç düşmemişken iadeyle **artıyordu** (testte 100 → 101); Cari ise hiç borçlanmamış müşteri alacaklanıyordu | İade ekranı ön siparişi listelemez (`findReturnableInvoiceItem`), sunucu da reddeder: "Teslim edilmemiş ön sipariş iade edilemez; önce Stok Düş" |
| 5 | F2 "son satılanlar" ve "son fiyat" önerisi silinen fişlere de bakıyordu | Yalnızca öneri, tutar değil | `deletedAt: null` |

Değişmeyen, bilerek: anasayfa "Bugün satış" **brüt** satıştır, iade
düşülmez (Satış Kırılımı'nda İade ve Net Ciro ayrı). Kâr-Zarar'da iade
yok. Ekstre ve müşteri bakiyesi zaten doğruydu (ön sipariş hariç).

Doğrulama: `on-siparis-rapor-test.ts` (15 kontrol). Aynı test **eski
kodla 9 kontrolde kalıyor** — hata gerçekti, düzeltme gerçek. Veriye
yazan tek değişiklik iade reddi (yani bir yazmayı **engelliyor**).

**Canlıda iz var mı?** Kontrol sorgusu (salt okuma, tek satır) —
sonucu 0 değilse o iadeler elle incelenir. **15 Eylül 20:40'ta canlıda çalıştırıldı: 0 — temiz, düzeltilecek iz yok.**

```bash
kubectl exec -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t -e "SELECT COUNT(*) on_siparise_iade FROM InvoiceItem ii JOIN InvoiceItem src ON src.id=ii.sourceInvoiceItemId JOIN Invoice s ON s.id=src.invoiceId WHERE s.isPreOrder=1 AND s.deletedAt IS NULL"'
```

**v1.22.10 — kalite listesi (müşteri bildirdi, 16 Eylül gecesi).** Stok
Kartı'nda Kalite 6 sabit seçenekli listeydi; Excel'den gelen "Cof Orijinal",
"Soft Oled", "New Orijinal" gibi değerler veritabanında duruyor ama
seçilemiyordu. Stok Listesi'nin düzenleme formunda Kalite alanı **hiç
yoktu**. Artık ikisi de renk gibi yazılabilir alan; öneriler = varsayılan
6 + sistemdeki farklı değerler (`GET /api/settings/quality-suggestions`).
Bilinen 6 etiket koda çevrilerek saklanır (Excel ile aynı kural), diğerleri
metin. Stok listesi satırında kalite de görünür. `kalite-test.ts` (5).

**v1.22.9 — müşterinin beş isteği (16 Eylül gecesi).**

| # | İstek | Ne yapıldı |
|---|---|---|
| 1 | Sol menüde Ana Sayfa yeni sekmede açılmasın | Yalnızca Ana Sayfa aynı sekmede (`Sidebar.onNavigateHome`); Ctrl/orta tık yine yeni sekme. Diğer menüler değişmedi |
| 2 | Anasayfada bugünkü fiş ve satılan adet sayısı | Özet satırının altına ikinci satır: "Bugün fiş" ve "Bugün satılan adet" (yerel 00:00'dan, teslim edilmiş satışlar; `dashboard.bugun`) |
| 3 | Düzenlenen fiş anasayfada en üstte, başka yerde tarih sırası bozulmasın | Yalnızca `/api/sales/dashboard` son faturalar `updatedAt desc`; satırda kesim tarihi kalır, yanına "· düzenlendi <tarih>" (1 dk'dan fazla fark varsa). Fatura listesi, ekstre, raporlar `createdAt` |
| 4 | Kayıtlı fişe girince "kaydedilmiş" ibaresi | `KayitliFisRozeti`: Fatura Özeti'nin üstünde "KAYITLI FİŞ · no · tarih · Kaydet bu fişi günceller". Satış, alış, iade (yeni + düzenleme). İşlev değişmedi |
| 5 | Kaydetmeden önce Nakit/Cari onayı | `OdemeOnayModal`: doğrulamalar geçince yöntem büyük harfle sorulur (NAKİT / CARİ / KART / EFT; alışta KAPALI·NAKİT / AÇIK·CARİ; iadede İADE·NAKİT / İADE·CARİ; ön siparişte ÖN SİPARİŞ·CARİ). Varsayılan odak "Hayır" — Enter'la geçilemez; E = evet, H/Esc = hayır. Düzenlemede de sorar |

Doğrulama: `on-siparis-rapor-test` 19 kontrol (bugün fiş/adet: ön sipariş
saymaz, tamamlanınca sayar, silinince düşer); `tsc` + `vite build` temiz.
**Maliyet sorusu** (fişte 46 $, kartta 40 $) ayrı — aşağıda "Maliyet".

**AÇILIŞ KAYITLARI — PROVADA TAMAMLANDI (17 Eylül 00:40), CANLI ONAY
BEKLİYOR.** 11 Eylül'de 49 açılış kaydı varmış: 37 "ESKİ SİSTEMDEN
AKTARILDI" + 12 yalnızca "AKTARILDI" (ÖDM-0039…0050, 11.271,10 $ giriş —
DURUM'daki "50 kayıt / 14.860 giriş" bunların toplamıydı; +2 deneme kaydı
5 $). Betik iki kalıbı da kapsar. Provada sonuç: 49 kasasız, kasa
2.767,46 → **14.579,47 $**, hareket toplamı = bakiye. Bu rakam = 12
Eylül'den beri kasaya net giren para (başlangıç nakdi 0 varsayımıyla).

**v1.22.21 — ANASAYFADA FİŞ YAZDIR (müşteri isteği, 17 Eylül).** "Son
Fatura Hareketleri"nde her satıra yazıcı simgesi; Fatura Listesi'ndeki
Yazdır ile aynı akış (`autoPrint` → düzenleme ekranı → yazdırma diyaloğu →
anasayfaya dönüş). Fişe girmeden yazdırılır.

**v1.22.20 — YAZDIRMADA AÇIK PENCERE BASILIYORDU (müşteri, 17 Eylül).**
F2 arama kutusu açıkken fiş/PDF çıktısında kutu da basılıyordu ("ekran
görüntüsü gibi"). Gizleme her pencereye tek tek `print:hidden` ile
yapılıyordu, F2 penceresinde ve başka on kadar pencerede yoktu. Kural
(`index.css` `@media print`): sabit konumlu (`.fixed`) ve `role="dialog"`
her şey çıktıda gizli. Fiş şablonları akışta durduğu için etkilenmez.

**v1.22.19 — PDF DOSYA ADLARI (müşteri isteği, 17 Eylül).** "Müşteriyle
ilgili bir şey yazdırıyorsam firmanın adı ve fatura numarası yazsın."
Fişler sekme başlığıyla iniyordu (`Satış Yap · Shenzhen Market.pdf`, hepsi
aynı ad). `musteriDosyaAdi()` (lib/printMode.ts): `<Firma> - <Tür> - <No>`,
geçersiz karakterler tire. Satış / Ön Sipariş / Alış / İade (Kaydet+Yazdır,
düzenlemede Yazdır, listeden Yazdır — `useAutoPrint` ad alır) ve
Tahsilat / Ödeme fişi (`<Firma> - Tahsilat - TAH-…`). Ekstre zaten
`<Firma> - Ekstre - <tarih>` idi. Barkod yazdırma müşteriyle ilgili değil,
dokunulmadı.

**v1.22.18 — FİŞ KALEM SIRASI (müşteri isteği, 17 Eylül).** Fiş
çıktısı Ağustos'tan beri düz alfabetikti; 15 Eylül'deki kategori kuralı
yalnızca F2 listesine uygulanmıştı. Karar:

| Nerede | Sıra |
|---|---|
| Sepet, yeni fiş yazılırken | **Ekleme sırası** (personel yeni satırı nerede göreceğini bilsin) |
| Sepet, kayıttan sonra / listeden düzenlemeye açılınca | Fiş sırası |
| Fiş / A4 / PDF çıktısı | **Her zaman** fiş sırası |

Fiş sırası = EKR → BAT → diğer kategoriler alfabetik → kategorisiz sonda;
kategori içinde **doğal** ad sırası (IPH-8 < IPH-11). `lib/fisSirasi.ts`
(`FIS_KATEGORI_ONCELIGI`), sunucudaki `f2KategoriSirasi` ile aynı kural —
**biri değişirse ikisi birlikte.** Önek kategori adından türetilir
(`categoryPrefix` kopyası), stok kodundan değil; eski kodlu ürünler de
doğru kategoriye düşer. Sunucu: F2 yanıtı ve fatura kalemleri `category.name`
döner. Üç ekran (Satış/Alış/İade) bağlandı; `tsc` + `vite build` temiz.

**v1.22.17 — DÜZENLEMEDE EKLENEN KALEM HER KAYDETTE KATLANIYORDU
(müşteri şikâyeti, 17 Eylül).** Önce "alışta bazı kalemler iki kez
yazılıyor" dendi, sonra netleşti: iade fişi kaydedilir → ürün eklenir →
Kaydet → bir ürün daha → Kaydet: önceki eklenen ürün fişe ikinci kez
yazılıyor. Ben iki Kaydet'le deneyip göremedim; hata üçüncü Kaydet'te
çıkıyor.

Mekanizma: ilk Kaydet (POST) sonrası ekran "aynı fişi güncelle" kipine
geçer ve kalem id'lerini yanıttan eşler (v1.21.2). Düzenlemede eklenen
satır PUT'a `productId` ile gider, sunucu ekler ve id'sini döner — ama
**ekran PUT yanıtını hiç işlemiyordu.** Satır id'siz kaldığı için bir
sonraki Kaydet'te yine "yeni kalem" olarak gidiyordu. Her Kaydet bir
kopya daha; stok ve cari de o kadar kez işleniyor.

| Ne | Nasıl |
|---|---|
| Ortak yardımcı | `frontend/src/lib/kalemEsleme.ts` — `kalemIdleriniEsle`: bağlı olmayan satırları, sunucunun döndürdüğü ve henüz sahiplenilmemiş kalemlerle ürün bazında sırayla eşler. Saf fonksiyon (eski koddaki `Map.shift()` güncelleyici içinde mutasyon yapıyordu) |
| Satış / Alış | `kalemleriSepeteBagla` hem POST hem PUT yanıtından sonra |
| İade | `handleEditSave` PUT yanıtından `editLines.invoiceItemId` doldurulur |
| Sunucu | Değişmedi — PUT zaten `items` döndürüyordu |

Doğrulama: `tekrar-kaydet-test.ts` (11 kontrol): iade A → B ekle Kaydet
→ C ekle Kaydet → boş Kaydet = 3 kalem, B stoğu bir kez; alışta aynı tur
3 kalem; son kontrol eski ekran davranışını (id'siz gönderim) bilerek
tekrarlar ve 4 kalem çıktığını gösterir — hata ekrandaydı. `tsc` +
`vite build` temiz.

**Canlıda etkilenen fişler (kurulumdan önce çalıştır, yalnızca okur):**
```
kubectl exec -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t -e "SELECT i.invoiceNo, i.type, i.paymentMethod, i.updatedAt, p.sku, GROUP_CONCAT(ii.id ORDER BY ii.id) kalem_idler, GROUP_CONCAT(ii.quantity ORDER BY ii.id) adetler, GROUP_CONCAT(ii.unitPrice ORDER BY ii.id) fiyatlar, COUNT(*) n FROM InvoiceItem ii JOIN Invoice i ON i.id=ii.invoiceId JOIN Product p ON p.id=ii.productId WHERE i.deletedAt IS NULL GROUP BY i.id, ii.productId HAVING n>1 ORDER BY i.id DESC"'
```
Aynı ürün, aynı adet/fiyat, **aralıklı** kalem id'leri = bu hatanın izi.
Ardışık id + alış = v1.22.13'ün bilerek açtığı ayrı satır, hata değil.
Düzeltme: fazla kalemi fiş düzenleme ekranından silmek yeterli — sunucu
stoğu ve cariyi geri alır (`removeItemIds`). Elle SQL gerekmez.

**Canlıya geçiş sırası (müşteri "geçelim" deyince), hepsi tek satır:**
1. Yedek: `bash k8s/prova-tazele.sh shenzhen` (canlının tam dökümü `/root/prova-kaynak-…` olarak kalır)
2. `kubectl exec -i -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/kasa-hareket-tamamla.sql` → fark 0
2b. Aynı kalıpla `k8s/sql/hareket-musteri-esitle.sql` → 3 eşitlendi; `cari-mutabakat.sql` → farklı 0
3. `bash k8s/update-all-tenants.sh v1.22.16 shenzhen` → migrate günlüğünde `transaction_kasasiz`
4. `kubectl exec -i -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/acilis-kayitlari-kasasiz.sql` → 49 kasasız, fark 0
5. Müşteriye Excel indir-yükle turu (58 ürünün katmanı) ve 25 kalem maliyet SQL'i (ayrı onay)
Geri alma: `k8s/sql/GERI-AL-*.sql`; en kötü durumda 1. adımdaki döküm geri yüklenir.

**CARİ MUTABAKATI — PROVADA TEMİZ (17 Eylül 01:00).** `k8s/sql/cari-mutabakat.sql`:
216 müşteride kayıtlı bakiye = fiş + hareket hesabı, fark 0, toplam 21.966,04.
Açılış kayıtları carilere işlenmiş. Tek bulgu: 3 nakit fiş Genel Müşteri'ye
kesilip sonra müşterisi değiştirilmiş, eski sürüm hareketin etiketini
Genel'de bırakmış (Genel −6.241,50 / Ahmet Çetinkaya +6.203,50 / Murat Akyel
27 / İsmail 11). `hareket-musteri-esitle.sql` etiketi fişin müşterisine
eşitledi (tutar/bakiye değişmedi). **Kod düzeltmesi (v1.22.16):**
`reconcileInvoiceFinancials` müşteri değişince fişin hareketlerini de taşır;
`kasa-hareket-test` 6b. Canlı sırasına 2b olarak eklendi.

**v1.22.15 — KASASIZ CARİ KAYDI (müşteri onayı, 16 Eylül gecesi).**
Müşterinin üç sorusu: "kasamda ne kadar var?", "müşteri carisine para
yatırmak istiyor" (bu zaten Tahsilat), "müşteriye borçluyuz, carisine
alacak yazalım ama kasadan çıkmasın" (bu YOKTU). Aynı eksik 11 Eylül
açılış kayıtlarını bozmuştu: 50 kayıt tediye/tahsilat girildi, kasadan
**11.512 $ hiç çıkmamış para çıkmış** görünüyordu.

| Ne | Nasıl |
|---|---|
| **Şema** | `Transaction.safeId` NULL olabilir — migration `20260916230000_transaction_kasasiz` (tek `ALTER … MODIFY`; veri silinmez/taşınmaz). v1.21.4'ten beri ilk migration; backend'in migrate init container'ı kurulumda uygular |
| Tahsilat/Ödeme | "**Kasaya işleme — yalnızca cari**" anahtarı: Giriş = müşteri lehine alacak, Çıkış = aleyhine borç; kasa/yöntem sorulmaz. Düzenlemede kasalı ↔ kasasız çevrilebilir (anasayfa ve ekstre pencerelerinde kasa seçimi boş = kasasız) |
| Kasa Raporu | Kasasız kayıtlar girmez. Üstte büyük **"Kasada şu an"**; dönem giren/çıkan/net; kaynak tablosu; "Kasaya göre" yalnızca >1 kasada. Açıklama kısaldı |
| Ekstre / anasayfa | Kasasız satır "Alacak kaydı / Borç kaydı (kasasız)" |
| Açılış kayıtları | `k8s/sql/acilis-kayitlari-kasasiz.sql`: 50 kaydı kasasız yapar, kasa bakiyesini net etki (+11.512) kadar geri alır; müşteri bakiyelerine dokunmaz. **Sürüm kurulduktan sonra**, önce prova |

`kasasiz-cari-test.ts` (18): bakiye değişir kasa değişmez, kasa raporunda
yok, ekstre toplamı = bakiye, kasalı↔kasasız düzenleme. Tüm takım 18/18.
Beklenen: kasa 2.767,46 → **14.279,46 $** (fiziksel sayımla karşılaştırılacak).

**v1.22.14 — stok geçmişi "Toplam Giriş" Excel/elle girişleri de saysın
(müşteri, 16 Eylül gecesi).** Excel yüklemesi, elle stok düzenleme ve
transfer fiş bırakmaz; katmanda yalnızca KALAN durur. Denklikten türetildi:
`stokGirişi = mevcut + satış − alış − iade` (negatifse elle düşüm, çıkışa
yazılır). Artık her zaman giriş − çıkış = mevcut; alt satırda kırılım
("alış 8 · iade 2 · stok girişi 100"). Çin iadesi merkez girişine sayılmaz.
`rapor-test`: 110 − 10 = 100.

**v1.22.13 — müşterinin istekleri (16 Eylül gecesi, 3. tur).**

| # | İstek | Ne yapıldı |
|---|---|---|
| 1 | Alışta aynı ürün yeni satır olsun (satış/iade birleştirsin) | `PurchaseCreate`: aynı ürün her seferinde yeni kalem; her satır kendi maliyetiyle katman açar |
| 2 | Sepette yön tuşları kutu içinde imleç gezdirmesin, gelinen kutuda yazılan eskisini silsin ("9,179,18" olmasın) | `useCartGridKeyboardNav`: sol/sağ her zaman komşu hücre; gelinen hücre tümüyle seçili, blur sonrası yeniden çizimin düşürdüğü seçim bir kare sonra yenilenir (`NumericInput` de). Satış/alış/iade ortak |
| 3 | Stok Hareketleri'nde fiş penceresinde "Düzenle" | Sayfada fiş no tıklanır → pencere → Düzenle **yeni sekmede** açar (eldeki sepet kaybolmasın). Ürün stok geçmişi penceresinde de aynı (`openInvoiceEditorInNewTab`) |
| 4 | Ürün stok geçmişi penceresinin altında Toplam Giriş / Toplam Çıkış / Mevcut | `stock-history` yanıtına `urunToplam` (alış+iade / teslim edilmiş satış / merkez stok; sayfalama ve müşteri süzgecinden bağımsız). `rapor-test` kontrolü |
| 5 | Nakit satış ekstrede iki satır (satış + tahsilat) olmasın | Fiş kaynaklı kasa hareketleri (satış tahsilatı, alış/iade ödemesi, düzenleme farkı) fişin satırına katlanır: borç 12 / alacak 12 + "Tahsil edildi 12 $ · Nakit" rozeti. Yürüyen bakiye aynı. Cari tahsilat/ödeme fişleri ayrı kalır. Silinmiş fişin hareketleri toplam sıfırsa düşer. `rapor-test`: ekstre toplamı = müşteri bakiyesi |
| 6 | Ekstre ve Fatura Listesi satırları arasında ince çizgi | `divide-slate-200` + `border-b` |
| 7 | Fatura Listesi'nde Yazdır düğmesi (fişe girmeden) | Yazdır → fiş düzenleme ekranında açılır, yüklenince yazdırma diyaloğu, kapanınca listeye dönüş (`useAutoPrint`); çıktı satış/alış/iade ekranıyla birebir, ayrı şablon yok |

`tsc -b` + `vite build` temiz; `rapor-test` 38 kontrol. **Yerel `tsc --noEmit -p .`
hiçbir dosyayı denetlemiyormuş** (tsconfig `files: []`) — v1.22.12 Docker
derlemesi bu yüzden bir kez düştü; artık `tsc -b`.

**v1.22.12 — müşterinin dört isteği (16 Eylül gecesi, 2. tur).**

| # | İstek | Ne yapıldı |
|---|---|---|
| 1 | Ekstredeki "Ödeme Düzenle" yalnızca dolar alıyor, Tahsilat/Ödeme ekranındaki gibi TL de girilebilsin | Tutar alanı + $/₺/€ seçici ortak bileşen oldu (`components/PaymentAmountField.tsx`, çevirim `lib/paymentCurrency.ts`); Tahsilat/Ödeme ekranından çıkarılıp ikisinde de kullanıldı. TL/EUR günün kurundan (Harem + fark) dolara çevrilip kaydedilir, USD saklanır |
| 2 | Ekstre PDF'inin dosya adı "Müşteri Ekstre · Shenzhen Market" çıkıyor, müşteri adı elle yazılıyor | Yazdırma süresince sekme başlığı `"<Müşteri> - Ekstre - 16.09.2026"` olur, sonra geri alınır (`printDocument(dosyaAdi)`) |
| 3 | Stok Hareketleri'nde ürünün mevcut stoğu görünmüyor | Arama sonucunun üstünde "Mevcut stok" şeridi: eşleşen ürünler (ilk 12) merkez adedi (0 kırmızı, ≤5 sarı) + varsa Çin iade. `/api/reports/stock-history` yanıtına `stokOzeti` eklendi; liste/arama değişmedi |
| 4 | Fiş kaydedince ekrandaki müşteri bakiyesi eski kalıyor, "satış sonrası tahmini" yazmaya devam ediyor | Satış/alış/iade — yeni kayıt ve düzenleme sonrası bakiye sunucudan tazelenir (`fetchCustomerBalance`). "Satış sonrası tahmini" yalnızca henüz kaydedilmemiş fişte; kayıtlı Cari fişte "Bu fiş bakiyeye işlendi" |

`tsc` + `vite build` temiz. Sunucuda yalnızca stok özeti (salt okuma) eklendi.

**v1.22.11 — düzenleme ekranında "Maliyet" satış fiyatını gösteriyordu
(müşteri sorusu, 16 Eylül: "fişte 46, stok listesinde 40").** Sorgu
sonucu: EKR00858'in tek katmanı 40 $ (11 Eylül açılışı), fiş
260915184312'de kayıtlı maliyet **40** — veri doğru, kâr raporu doğru.
46 = ürünün önceki fişlerdeki **satış fiyatı**. Sebep: `/api/sales/invoices/:id`
ürünün `costPrice`'ını göndermiyordu; düzenleme ekranı (F8 Maliyet
sütunu) maliyeti bulamayınca `priceUsd`'ye düşüyordu. Artık uç `costPrice`
gönderir, ekran önce kalemin kayıtlı `unitCost`'unu (satış anındaki
katman maliyeti), yoksa kart maliyetini gösterir. Test eklendi
(`on-siparis-rapor-test`: detayda unitCost 5 / costPrice 5, satış fiyatı 10 değil).
Aynı sorguda görülen: 260915094213 (4 adet) `unitCost NULL` — "25 kalem
boş maliyet" listesinden, düzeltme SQL'i onay bekliyor; stok 3 / katman 7
ayrışması da o fişten (v1.22.5 öncesi ön sipariş tamamlama).

**STOK EKSİĞİ — BEKLEMEDE (16 Eylül).** Müşteri "stoklarımda eksikler var"
dedi. Bilinenler:

- Canlıda 12 Eylül'den beri **hiç Excel yüklenmemiş** (son toplu yazma
  11 Eylül 19:51–19:54, ilk yükleme). Eksik sonradan yüklemeyle gelmedi.
- Excel kuralı (`excelExchange.ts:1216`): **Bakiye üzerine yazar,
  GelenAdet ekler; GelenAdet doluysa Bakiye yok sayılır.** İlk yüklemede
  "ikisi de dolu" senaryosu düşünüldü; müşterinin masaüstündeki
  `SM-stoklar-20260911-1901.xlsx` dosyasında GelenAdet tamamen boş — o
  ihtimal bu dosya için düştü.
- O dosya (sistemden 19:01'de indirilmiş, sıfırlamadan önce): **1.146
  üründe stok, 22.604 adet.** Yüklemeden sonra kayıtlı olan (DURUM,
  11 Eylül): **235 ürün, 10.923 adet.** Ama müşteri bu dosyanın doğru
  sayım olduğundan emin değil → **beklemede.**

Karar: doğru dosya bulunana kadar dokunulmaz. Dosya gelince
`dosyadaki stok + alış − satış + iade (12 Eylül'den itibaren) = olması
gereken` hesabı provada yapılır (`k8s/sql/stok-mutabakat.sql` ve
`stok-uclu-karsilastirma.sql` kalıbı; Excel'i tabloya yükleyen SQL
müşteri verisi olduğu için depoda değil, masaüstünde `excel-1109.sql`),
liste müşteriye gösterilir, onayla canlıya yazılır. O zamana kadar
personel **stoğu elle düzeltmesin, mal girişi Alış Faturası ile** —
elle düzenleme ve transfer fiş bırakmaz, hesabı bozar.
12 Eylül 03:00 yedeği (`shenzhen-20260912-*.sql.gz`) 26 Eylül'de 14 gün
döngüsüyle silinir; **`/root/` altına kopyalanacak.**

**Kasa — açılış kayıtları.** 11 Eylül akşamı 50 adet "ESKİ SİSTEMDEN
AKTARILDI" kaydı: borçlu müşteriler tediye (ÇIKIŞ, 26.372 $), alacaklılar
tahsilat (GİRİŞ, 14.860 $). Cari bakiyeler için doğru; ama her tediye
kasadan para çıkarır — **net −11.512 $ kasadan çıkmış görünüyor.** Kasa
bakiyesi 1.051,91 $ görünüyor; yukarıdaki 3. madde düzeltilmeden hareket
toplamı −139,34 $ idi. Düzeltme rakamı iki sorgunun çıktısıyla
netleşecek (nakit satış toplamı vs fatura kaynaklı hareket toplamı);
sonra sunucudan tek satır SQL ile `Safe.balance` düzeltilir. Bu kayıtlar
silinmez — cari bakiyeler onlara dayanıyor.

### Yapıldı (11 Eylül)

**Ürünler yüklendi — ama mükerrer olayı ikinci kez yaşandı.**

Müşteri iki Excel gönderdi: önce stokları sıfır olan bir liste, sonra ürün
eklenmiş ve stok girilmiş güncel listesi. İkinci dosya sisteme yüklenirken
`Id` ve `StokKodu` sütunları silindi — dosya müşteriden geldiği için
içindeki kodlar eski sistemin kodlarıydı, bırakılsa da eşleşmeyecekti.

Program eşleşmeyen satırı yeni ürün sayar (`excelExchange.ts:869`, eşleşme
yalnızca `Id` sonra `StokKodu` ile; **ad üzerinden eşleştirme yok**) ve
Excel yüklemesi asla silmez (`excelExchange.ts:1119`, v1.11.0 kararı).
Sonuç: 5248 + 5387 = **10635 ürün**, 4880 mükerrer ad.

Çözüm — fatura/stok hareketi henüz olmadığı için sunucudan elle SQL ile
tüm ürünler, kategoriler ve marka/modeller silindi, güncel Excel **boş
tabloya bir kez** yüklendi. Sonuç doğrulandı:

```
urun 5387 · yeni_bicim 5387 · bicim_disi 0 · mukerrer_ad 5
MERKEZ_DEPO · 235 urun · 10923 adet
```

Kalan 5 mükerrer ad sistemden değil, **Excel dosyasının kendi içinde**
aynı adla iki kez yazılmış satırlardan geliyor. Renk/kalite farklıysa
dokunulmayacak, birebir aynıysa stoksuz olan silinecek.

> **Kural (ikinci kez yazılıyor):** dolu tabloya, sistemden indirilmemiş
> Excel yüklenmez. Müşteri yeni liste gönderdiğinde doğru yol: sistemden
> Excel'i indir, değişiklikleri onun üstüne işle, `Id` ve `StokKodu` dolu
> hâlde geri yükle. Boş tabloya yüklerken sütunların boş olması doğrudur —
> o tek seferliktir.

**Fiş yeniden tasarlandı.** İmajlar v1.20.0 olarak çıkarıldı, sonra
Harem kuru v1.21.0'a, A4 düzeni v1.21.1'e eklendi. Kurulacak sürüm
**v1.21.1** — öncekiler provaya hiç kurulmadı.

Müşteri isteği: puntolar büyüsün, müşteri adresi çıkmasın, üstte logo
alanı olsun, açıklama yazılmışsa görünsün, net toplam ve iki bakiyede TL
karşılığı yazsın, en altta firma adı dursun, satış yapan kalsın.

- Ölçü **68mm sabit** (`index.css`) — yazıcı ayarı buna bağlı, değişmedi
- Beş fişin (satış, alış, iade, tahsilat, ekstre) ortak çerçevesi tek
  bileşende toplandı: `frontend/src/components/ReceiptSlip.tsx`.
  Bu arada iade fişindeki çift müşteri bloğu da düzeldi — biri A4'e ait
  `pdf-party` sınıflarını kullanıyordu.
- Logo `tenant.logoUrl` ile gelir (ConfigMap). **Dosya henüz gelmedi**,
  şimdilik kesik çizgili `LOGO` yer tutucusu basılıyor; dosya gelince
  ConfigMap güncellenir, kod değişmez, sürüm çıkmaz.
- **A4/PDF çıktısı da aynı düzene getirildi** (`ReceiptPdf`): logo, alttaki
  firma adı, toplamların altında TL karşılığı, kur dipnotu. Önceden yalnızca
  termal fiş elden geçmişti ve iki çıktı farklı görünüyordu. Bu arada iade
  fişinin A4'ünde hiç basılmayan müşteri bloğu da eklendi.

**TL karşılığı — `exchangeRate` alanına YAZILMADI, ayrı alan açıldı.**

Tuzak şu: `totalAmountTl` adına rağmen **USD tutar taşır** ve cari bakiye
bu alandan işler (`index.ts:3338`). `exchangeRate` ise
`totalAmountUsd = totalAmountTl / exchangeRate` dönüşümünü tanımlar ve her
zaman 1'dir. Oraya gerçek kur yazılsaydı USD tutarlar kur katı kadar
küçülür, kâr ve ciro raporları sessizce bozulurdu.

Bunun yerine `Invoice.tryRate` ve `Transaction.tryRate` eklendi —
yalnızca fişte TL yazmak için, hesaba hiç girmiyor. Migration:
`20260911120000_invoice_transaction_try_rate` (iki `ALTER TABLE ... NULL`).

Kur fatura kaydedilirken yazılır, böylece fiş aylar sonra yeniden
basıldığında da kesildiği günün rakamını gösterir. Ekstre farklı: orada
basılan üç rakam da bugüne ait toplam olduğu için **anlık kur** kullanılır.

**Kur çekimi satışı bekletmiyor.** İlk hâlde TCMB yanıt vermezse 15 sn,
ardından ECB 10 sn bekleniyordu — satış 25 saniye asılı kalabilirdi.
`receiptTryRate()` artık en fazla **1,5 saniye** bekler; istek arka planda
sürüp önbelleği ısıtır, süre dolarsa son bilinen kur kullanılır, o da
yoksa fişe TL satırı basılmaz.

Yerelde doğrulandı — `backend/prisma/fis-kur-test.ts`, temiz veritabanı,
gerçek satış ve tahsilat:

```
GECTI  kur cekimi satisi bekletmedi        (261 ms)
GECTI  tryRate yazildi                     (tryRate=48.4941)
GECTI  exchangeRate 1 kaldi                (exchangeRate=1)
GECTI  cari bakiye USD kadar arti          (bakiye=90 — kur bulassaydi ~4364)
GECTI  bakiye 90 - 30 = 60                 (bakiye=60)
```

Kur kaynaklarının ikisi de erişilemez hâle getirilip tekrar denendi:
satış **1.611 ms**'de bitti, `tryRate` null kaldı, **tutar ve bakiye
etkilenmedi**.

**Harem kuru yazıldı — v1.21.1.**

Müşteri isteği: kurlar Harem Altın'dan gelsin, üzerine 0,20 eklensin.
Kararlar: **satış kuru + 0,20**, hem fişte hem TL tahsilat çevriminde,
Harem düşerse **son bilinen Harem kuru** görünür uyarıyla kullanılsın.

> **Bu yalnızca bir gösterim ayarı değildir.** TL ile girilen tahsilat bu
> kurdan dolara çevrilip cariye yazılır (`amountToStoredUsd`). Farkı
> artırmak müşteriye yazılan dolar tutarını azaltır — ölçüldü: 10.000 TL
> ödeme 206,19 $ yerine **205,35 $** olarak düşüyor.

Harem'in açık API'si YOK. Eski ucu (`/dashboard/ajax/doviz`) 404 ve
kendi kodlarında yorum satırına alınmış. Site canlı veriyi
`wss://hrmsocketonly.haremaltin.com:443` üzerinden socket.io ile çekiyor;
polling reddediliyor. Biz de aynı akışı dinliyoruz —
`backend/src/lib/haremKuru.ts`, protokol elle konuşuluyor, `ws` paketi
eklendi (imajdaki Node 20'de yerleşik WebSocket yok).

**Bunun riski açıktır:** belgelenmemiş, sözleşmesiz bir akış. Harem biçimi
değiştirirse durur. Ücretli alternatif incelendi: `altinapi.com`, aynı
sağlayıcıdan besleniyor, `X-API-Key` ile REST, Starter **$19/ay**
(ücretsiz kademe 500 istek/ay — bize yetmez). Socket bizi bırakırsa
oraya geçilir.

Fark ayarlanabilir: `tenant.kurFarki` → `KUR_FARKI`. **Varsayılan 0,20 —
proje kararı (11 Eylül 2026): bütün müşteriler bu farkla çalışsın.**
Marj istemeyen müşteri açıkça `kurFarki: 0` yazar.

Varsayılan İKİ YERDE savunulur — chart'ta ve backend kodunda
(`VARSAYILAN_KUR_FARKI`). Sebep: `update-all-tenants.sh` `--reuse-values`
kullanıyor ve yeni chart varsayılanları her zaman pod'lara ulaşmıyor;
ayar yolda kaybolursa sessizce marjsız çalışılırdı. Ortam değişkeni hiç
verilmeden denendi, fark yine uygulandı (`"source": "Harem +0,20"`).

`tenants/shenzhen.yaml`'da da açıkça `0.20` yazılı: varsayılan ileride
değişirse bu müşterinin marjı sessizce kaymasın diye.

Yerelde doğrulandı — `backend/prisma/harem-kur-test.ts`:

```
kaynak: Harem +0,20   ham satis 48,498 -> uc 48,698   (fark tam 0,200)
faturaya yazilan kur = tahsilatta kullanilan kur = 48,698
tutar/bakiye USD kaldi: 100 $
10.000 TL:  farksiz 206,19 $   farkli 205,35 $
```

Arıza yolları da denendi:

| Senaryo | Sonuç |
|---|---|
| Harem hiç ulaşılamıyor | `TCMB +0,20` + "Harem kuru alınamadı" uyarısı |
| Harem bağlandı, veri bayat | Kur Harem'de kalır, "N dakikadır güncellenmedi" uyarısı |

Tahsilat ekranında TL/EUR seçiliyken uyarı sarı kutuda görünür — bayat
kurla para işlemi yapıldığı gizlenmiyor.

**Müşterinin bildirdiği 7 sorun düzeltildi (v1.21.2).**

| # | Sorun | Ne yapıldı |
|---|---|---|
| 1 | Aynı fişi tekrar kaydetmek İKİNCİ FATURA açıyordu | Kayıttan sonra ekran o faturayı düzenlemeye devam eder; tekrar Kaydet aynı fişi günceller. Yeni fiş için **"Yeni Fiş"** düğmesi. Satış, alış ve iadede |
| 2 | Alış, ürünün SATIŞ fiyatını maliyete eşitliyordu | `index.ts`'te iki yerde `priceUsd = alış fiyatı` vardı (alış ucu + fatura düzenleme). İkisi de kaldırıldı. Alış artık yalnızca stok sayar ve FIFO katmanı açar |
| 3 | Ekstrede düzenlenen eski fiş en üste fırlıyordu | `buildInvoiceCreatedAt` tarihi dosyadan, **saati o andan** alıyordu. Yeni `mergeInvoiceDate`: tarih değişmediyse kayda hiç dokunmaz, değiştiyse faturanın kendi saatini korur |
| 4 | İade fiyatı değiştirilemiyordu | Birim fiyat artık her satırda düzenlenebilir; varsayılan yine son satış fiyatı |
| 5 | Faturaya "İnsiyatif iade…" yazıyordu | Otomatik metin kaldırıldı. Kullanıcı açıklama yazdıysa o yazılır. (Sebebi: iade ekranı her zaman `return-discretionary` ucunu çağırıyor — müşterinin bizde satış kaydı olmayan malı iade etmesi olağan) |
| 6 | İade düzenleme ekranı farklı görünüyordu | "Hızlı İade Al" ile aynı iki sütunlu tezgâh düzenine alındı; alanlar ve işleyiciler aynen korundu |
| 7 | Ödeme alınca kutular sıfırlanıyor, tekrar basınca ikinci kayıt açılıyordu | Kutular dolu kalır; tekrar basmak **aynı kaydı günceller**. Müşteri değişince kilit bırakılır (yoksa önceki müşterinin kaydı güncellenirdi). **"Yeni Ödeme"** düğmesi |

**İADE BAKİYEYE DOĞRU İŞLİYOR** — testle kanıtlandı, kodda hata yoktu.
100 $ satış → 40 $ iade (Açık/Cari) → bakiye **60 $**. Kullanıcının gördüğü
durum muhtemelen **"Kapalı Fatura (Kasadan)"** seçimiydi: o seçenekte para
kasadan çıkar, cariye yazılmaz — ekranda da böyle yazıyor.

Doğrulama: `backend/prisma/duzeltmeler-test.ts`, 17 kontrol, hepsi gerçek uç
üzerinden:

```
GECTI  alis TOPTAN satis fiyatini ezmedi        (priceUsd=15.5)
GECTI  alis PERAKENDE satis fiyatini ezmedi     (priceUsd2=17)
GECTI  FIFO katmani gercek maliyetle acildi     (unitCost=12.7)
GECTI  IADE CARIYE ISLEDI (100 - 40 = 60)       (bakiye=60)
GECTI  nakit iade kasadan 30 dusurdu            (10000 -> 9970)
GECTI  duzenleme createdAt'i OYNATMADI          (aynı ISO damgası)
GECTI  kalemler katlanmadi                      (1 -> 1)
GECTI  ikinci bir SATIS faturasi acilmadi       (satis faturasi=1)
GECTI  20 -> 50 guncellemesi dogru islendi      (bakiye=10)
```

> **ESKİ HASAR:** 2. maddedeki hata, düzeltmeden ÖNCE yapılmış alışlarda
> ürünlerin satış fiyatını zaten bozmuş olabilir. Hasarlı ürünleri bulan
> sorgu (tek satır):
>
> ```bash
> kubectl exec -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t -e "SELECT DISTINCT p.sku, p.name, p.priceUsd toptan, p.priceUsd2 perakende, ii.unitPrice alis FROM InvoiceItem ii JOIN Invoice i ON i.id=ii.invoiceId JOIN Product p ON p.id=ii.productId WHERE i.type="ALIS" AND i.deletedAt IS NULL AND ABS(p.priceUsd-ii.unitPrice)<0.005 ORDER BY p.name"'
> ```
>
> Çıkan ürünlerin satış fiyatı elle düzeltilmeli — doğru fiyat yalnızca
> müşterinin Excel'inde var, sistem onu geri getiremez.

**Boş tabloda Excel indirince başlık gelmiyordu (v1.21.3).**

Sıfırlama sonrası "Excel İndir" tamamen boş bir dosya veriyordu — tek bir
sütun başlığı bile yok, şablon olarak kullanılamıyordu. Sebep:
`json_to_sheet` başlıkları **satırlardan** türetiyor, satır yoksa başlık da
yok. Artık başlıklar sabit listelerden `header` seçeneğiyle veriliyor; bu
aynı zamanda sütun **sırasını** da nesne anahtar sırasına değil listeye
bağlıyor. Dört çıktının dördü de düzeltildi: Stoklar, Müşteriler,
Faturalar, Kalemler.

Doğrulama: `backend/prisma/excel-baslik-test.ts` — boş tabloda 19 sütun
başlığı iniyor, dolu tabloda çıktı **birebir aynı** kalıyor (başlıklar,
sıra ve değerler tek tek karşılaştırıldı). Mevcut `excel-kod-test.ts` de
yeniden koşuldu, Excel modülü uçtan uca çalışıyor.

Stok listesinin sütunları:

```
Id · StokKodu · StokAdi · Kategori · Marka · Model · Gorunum · Kalite
Renk · Aciklama · Rmb · AlisFiyati · Satis1 · Satis2 · AlisAdedi
SatisAdedi · Bakiye · Uyumlu · GelenAdet
```

Zorunlu tek sütun `StokAdi`. `Satis1` toptan, `Satis2` perakende,
`Bakiye` merkez depo stoğu, `GelenAdet` mevcut stoğa **eklenir**.

**Fiyat listesinde stok kodu yerine açıklama (fiyat v1.6.0 + ERP v1.21.4).**

Müşteri isteği: listede ürünün açıklaması görünsün, stok kodunun yerine
gelsin; açıklaması olmayan üründe hiçbir şey yazmasın.

İki depoda birden değişiklik gerekti — açıklama açık uçtan hiç
gönderilmiyordu:

- **ERP** (`index.ts`, `/api/public/fiyat-listesi`): yanıta `aciklama`
  alanı eklendi. `kod` hâlâ gönderiliyor (satır anahtarı).
- **Fiyat listesi** (`FiyatTablosu.tsx`): satırın ikinci satırı artık
  açıklamayı gösteriyor, mono yazı tipi kalktı. Açıklama yoksa satır hiç
  çizilmiyor.

> **Bu uç HERKESE AÇIK.** Açıklamaya yazılan her şey dışarıya görünür —
> tedarikçi adı, dahili not gibi şeyler yazılmamalı. Excel'deki
> `Aciklama` sütunu artık müşterinin müşterisinin gördüğü bir alan.

Sıra serbest: ERP güncellenmeden fiyat listesi kurulursa açıklama
görünmez, hata olmaz (`temizle(undefined)` boş dizgi verir).

**WhatsApp numarası — ülke kodu normalleştirmesi.**

Yeni numara `0549 497 47 47`. `whatsappLinki` yalnızca rakam dışını
atıyordu; `05494974747` verilseydi bağlantı `wa.me/05494974747` olur ve
**sessizce çalışmazdı** — wa.me ülke kodu ister, baştaki sıfırı kabul
etmez. Artık üç yaygın biçim düzeltiliyor (`00…`, `0…`, sıfırsız 10
hane); yabancı numaralara dokunulmuyor.

Numara **ConfigMap'ten** gelir, sürüm gerektirmez:

```bash
helm upgrade teknikfiyat /root/teknikfiyat/charts/teknikfiyat -n tenant-shenzhen --reuse-values --set-string tenant.whatsapp="0549 497 47 47"
```

### TAM ŞU AN — 15 Eylül akşamı, kaldığımız yer

**Prova v1.22.7 + canlı kopyası (15 Eylül 20:15); v1.22.8 derlendi, kurulacak. Canlı v1.21.4.** Canlıya geçiş müşterinin
kararıyla bekliyor ("şimdi değil"). Müşteriye bugünün tam dökümü
verildi (ne değişti, canlıda ne olur, sırada ne var); "canlıya geçelim"
derse aşağıdaki 1–5 sırası uygulanır.

**Onay bekleyen üç canlı-veri işi** (hepsi salt kalem/etiket, tutar ve
bakiye değişmez):

1. **25 kalemin boş maliyeti** — ön siparişten tamamlanmış 20 fiş. Kural:
   elde kalan malın katman maliyeti varsa o, yoksa ürün kartındaki alış.
   Liste görüldü (21'i kart=katman, 4'ünde katman yok, BAT00383'te kart
   4,80 / katman 6,50 → 6,50). Tek satır, `degisen` 25 vermeli:

```bash
kubectl exec -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t -e "UPDATE InvoiceItem ii JOIN Invoice i ON i.id=ii.invoiceId JOIN Product p ON p.id=ii.productId SET ii.unitCost = COALESCE((SELECT ROUND(SUM(l.quantity*l.unitCost)/SUM(l.quantity),4) FROM StockLot l WHERE l.productId=p.id AND l.quantity>0), p.costPrice) WHERE i.type=\"SATIS\" AND i.isPreOrder=0 AND i.deletedAt IS NULL AND ii.unitCost IS NULL; SELECT ROW_COUNT() degisen"'
```

2. **Dolar kasası düzeltmesi — TEŞHİS KESİNLEŞTİ, PROVADA UYGULANDI (16 Eylül
   gecesi), CANLI ONAY BEKLİYOR.** Kasa bakiyesi 2.767,46 $, hareket toplamı
   887,21 $, fark **1.880,25 $** = eski sürümün (v1.21.4) hareket yazmadığı
   **22 nakit SATIS fişinin** farkları toplamı (kuruşuna kadar). Kasa bakiyesi
   ve müşteri bakiyeleri **doğru**; eksik olan yalnızca hareket kayıtları.
   Düzeltme `k8s/sql/kasa-hareket-tamamla.sql`: 22 hareket ekler
   ("<fişno> düzenleme farkı (eski sürüm)"), başka hiçbir şeye dokunmaz,
   tekrar çalıştırılırsa bir şey yapmaz. Provada sonuç: yazılan 22, fark 0,
   uyumsuz fiş 0. Canlı komutu (yalnızca müşteri "çalıştır" derse):
   `kubectl exec -i -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t' < k8s/sql/kasa-hareket-tamamla.sql`
   Not: "açılış tediyeleri −11.512 $" ayrı konu — o kayıtlar doğru, kasa
   bakiyesinde zaten hesaba katılmış; ekranda "Açılış / eski sistem
   aktarımı" olarak ayrı görünür.
3. **"Eski kodları düzelt"** — canlıda sürüm kurulunca müşteri listesinde
   düğme çıkar; müşteri isteyince basılır.

**Provada denenip geçenler:** Excel indir-yükle turu (5.439 güncellendi,
katman farkı yalnızca 15 eksi stokluda). Henüz ekrandan bakılmayanlar:
F2 sırası, TL satırı, anasayfa kartları, "DİKKAT" uyarısı, kasa
"düzenleme farkı", müşteri kodu düğmesi, ön sipariş tamamlama.

### Sıradaki adım

> **v1.22.8 derlendi, provaya kurulacak; canlı müşterinin kararıyla bekliyor.** Canlı v1.21.4.
> Prova 15 Eylül 20:15'te (dükkan kapandıktan sonra) canlının kopyasıyla
> dolduruldu (BIREBIR TUTTU: 5439 ürün, 216 müşteri, 291 fatura, 214 hareket).
> Kopyanın dökümü sunucuda: `/root/prova-kaynak-shenzhen-20260915-1715.sql.gz`.

1. Sunucuda `cd /root/teknikerp && git pull`
2. (Gerekirse tazele: `bash k8s/prova-tazele.sh shenzhen`)
3. Provaya kur: `bash k8s/update-all-tenants.sh v1.22.16 shenzhen-test`
   (veriyi tazelemeye gerek yok — kopya duruyor, sürüm değişince veri değişmez)
4. Provada dene:
   - **v1.22.13:** Alışta aynı ürün iki satır; sepette 9,17 → sol → aşağı → sağ →
     yukarı → "9,18" yaz = 9,18; Stok Hareketleri fiş no → Düzenle yeni sekme;
     ürün geçmişi penceresi altında toplamlar; nakit satış ekstrede tek satır
     + rozet; Fatura Listesi Yazdır → diyalog → listeye dönüş
   - **v1.22.12:** Ekstre → ödeme düzenle → ₺ seç, TL yaz, karşılığı görünsün;
     ekstre PDF adı müşteri adıyla; Stok Hareketleri'nde "Mevcut stok" şeridi;
     Cari satış kaydet → bakiye kutusu anında değişsin, "tahmini" satırı kalksın
   - **v1.22.11:** 260915184312'yi düzenlemede aç, F8 → Maliyet 40 (46 değil)
   - **v1.22.10:** Stok Kartı → Kalite'ye "cof" yaz → "Cof Orijinal" önerilmeli;
     Stok Listesi → düzenle → Kalite alanı var
   - **v1.22.9:** Sol menü Ana Sayfa aynı sekmede; anasayfada "Bugün fiş / adet";
     fiş düzenle → anasayfada en üstte "düzenlendi"; kayıtlı fişi aç → yeşil
     "KAYITLI FİŞ" rozeti; Kaydet → ödeme onay penceresi (Enter geçmez)
   - **v1.22.8:** Ön sipariş kaydet → Ana Sayfa "Bugün satış" DEĞİŞMEMELİ;
     Stok Düş → artmalı. Satış İade'de ön sipariş ürününü seç → "hiç
     alınmamış" uyarısı. Kâr-Zarar: iskontolu satışta ciro iskontolu
   - **v1.22.7:** Satış ve İade ekranında aynı ürünü iki kez seç → tek
     satır, adet 2, adet kutusu seçili
   - **v1.22.6:** Anasayfa Kasa kartı dolar bakiyesini göstermeli (0 değil);
     Raporlar → Satış Kırılımı → "Ürün Bazlı" ve "Satış Fişleri" sekmeleri,
     fiş satırı açılınca kalemler; Raporlar → Kasa Raporu → açıklama kutusu,
     "Kaynağa göre" tablosunda açılış aktarımları ayrı satırda, "Kasaya
     göre" bakiye = anasayfadaki kasa
   - Stok Listesi → Excel İndir → **değiştirmeden** Excel Yükle → katman
     farkı sorgusu (aşağıda) **0** olmalı
   - Aynı dosyanın `Id` ve `StokKodu` sütunlarını silip yükle → "DİKKAT …
     satırın adı sistemde zaten olan bir ürünle AYNI" sorusu çıkmalı,
     **İptal** → ürün sayısı değişmemeli
   - Nakit satış kes, kalem ekleyip tekrar Kaydet → Kasa hareketlerinde
     "düzenleme farkı" satırı görünmeli
   - Satış ekranında F2 → "iph 11" yaz: önce ekranlar, sonra piller;
     Net Toplam'ın altında TL satırı
   - Anasayfa: "Bugün satış" bugünün fişlerini toplamalı, "Bu hafta" kartı
   - Müşteri Listesi: "Eski kodları düzelt (N müşteri)" düğmesi → bas →
     M… kodlular sıradaki sayıyı almalı, bakiyeleri değişmemeli; yeni
     müşteri açınca kod seriden devam etmeli
   - Ön sipariş kaydet → "Stok Düş" → Kâr raporunda o fişin maliyeti
     dolu olmalı; katman sorgusunda o ürün görünmemeli
   - **Provada Excel indir-yükle turu yapıldı (15 Eylül):** 5.439 ürün
     güncellendi, katman farkı yalnızca 15 eksi stokluda kaldı (beklenen)
5. Canlıya (müşteri onayıyla): `bash k8s/update-all-tenants.sh v1.22.15 shenzhen`, ardından
   müşteriye Excel indir-yükle turunu yaptır (58 ürünün katmanı düzelir)

Katman farkı sorgusu (tek satır):

```bash
kubectl exec -n tenant-shenzhen-test deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t -e "SELECT COUNT(*) katman_farkli FROM ProductStock ps WHERE ABS(ps.quantity - IFNULL((SELECT SUM(l.quantity) FROM StockLot l WHERE l.productId=ps.productId AND l.branchId=ps.branchId),0)) > 0.001"'
```

**Sonraki sürüm (v1.23.0) — personel yetkisi.** `admin` / `satis`;
hangi ekranların satışa kapanacağı müşteriye sorulacak. Düz metin şifre
dalı da bu sürümde kapanır.

**Kod dışı bekleyenler:** repo private (5 dk), yedekleri Backblaze B2'ye
(`rclone`), kasa düzeltmesi (tek satır SQL, rakam bekleniyor).
**Stok eksiği:** doğru Excel bekleniyor (yukarıda). PV reclaim policy: canlının iki
diski (`pvc-d1748def…` mysql, `pvc-16f8c584…` yedek) **Retain** (16 Eylül,
müşteri çalıştırdı) — PVC silinse de disk sunucuda kalır. Demo ve prova
`Delete` (bilerek). Sunucunun kendisi giderse koruma yok → Backblaze B2 işi.
**Excel ön kontrolüne eklenecek:** "N satırda hem Bakiye hem GelenAdet
dolu — Bakiye yok sayılacak" ve "N üründe stok azalacak" uyarıları.

**İlk gün izlenecekler** (14 Eylül'de dördü de temiz çıktı; kalsın):

1. **Mükerrer fiş** — "Kaydet"e ikinci kez basınca ikinci fatura
   açılmamalı; üstte "kaydedildi · tekrar Kaydet aynı fişi günceller"
   yazmalı. Yeni satış için **"Yeni Fiş"** düğmesi kullanılır. Personele
   bunun söylenmesi gerekir: alışkanlık eski davranışa göre.
2. **TL tahsilat** — 10.000 TL girişi cariye ≈ **205,3 $** yazmalı
   (kur Harem satış + 0,20). 206,2 $ çıkıyorsa fark uygulanmamış demektir.
3. **Kur akışı** — `kubectl logs -n tenant-shenzhen deploy/teknikerp-backend | grep harem`
   içinde `baglanti kuruldu` olmalı. Harem belgelenmemiş bir akış;
   susarsa fiş TL'siz basılır ve ekranda "kur güncellenmedi" uyarısı
   çıkar. O noktada `altinapi.com` ($19/ay) yedek plan.
4. **Alış sonrası satış fiyatı** — bir ürün alıp satış fiyatına bak,
   değişmemeli. Eski hatanın tekrarı en pahalı olanı.

### Bekleyen küçük işler

- [ ] **5 mükerrer ad** — Excel dosyasının kendi içinde aynı adla iki kez
      yazılmış satırlardan geliyor. Sorgu bu belgede; renk/kalite
      farklıysa bırak, birebir aynıysa stoksuz olanı kalıcı sil.
- [x] ~~**Logo dosyası**~~ — **kuruldu (12 Eylül sabahı, canlı revision 12).**
      Müşterinin verdiği dosya 288×288 ama **24 bit renkli, kromlu
      degradeli** bir "A" idi (17.542 renk, piksellerin %15'i orta gri) —
      termal kafa 1 bit bastığı için fişte benek bulutu olurdu.
      Siluete çevrildi: kenardan taşan beyaz arka plan sayıldı, içeride
      hapsolmuş 52 ince parlama dolduruldu, A'nın göbeğindeki boşluk
      korundu. Sonuç **71 KB → 1,6 KB**, data URI 95 KB → 2 KB.
      Üretim betiği yok; gerekirse Pillow ile eşikleme + kenar taşma
      dolgusu yeniden yapılır. Kaynak: `~/Desktop/logo.png` (renkli
      orijinal) ve `~/Desktop/logo-fis.png` (siluet).

      Logo KODA GİRMEZ, ConfigMap'te yaşar:
      `helm upgrade teknikerp charts/teknikerp -n <ns> --reuse-values --set-file tenant.logoUrl=/root/logo-datauri.txt`
      ardından `kubectl rollout restart deploy/teknikerp-frontend -n <ns>`.
      Kaldırmak için `--set-string tenant.logoUrl=""`.

- [ ] **Excel `Bakiye` sütunu tuzağı** — sütun dosyada YOKSA bütün
      stoklar sıfırlanır (`Marka`/`Model`'deki "sütun yoksa dokunma"
      koruması burada yok). Müşteri kararıyla şimdilik böyle bırakıldı.
      Kısmi dosya yüklenecekse akılda tutulmalı.

### Yapıldı (10 Eylül)

- **Canlı veritabanı SIFIRLANDI.** Sunucudan elle SQL ile:
  ürün / fatura / kalem / stok / katman / kategori / marka-model = **0**,
  **181 müşteri kartı korundu**, cari ve kasa bakiyeleri 0'landı,
  3 şube (Merkez Şube + 2 depo) duruyor.
- Sıfırlamadan önce yedek alındı:
  `/root/shenzhen-sifirlama-oncesi-2026-09-09-2203.sql.gz` (270 KB)
- **ERP v1.19.0** derlendi ve Docker Hub'a gönderildi.
- Müşteri kılavuzu ve dahili işletme notları yazıldı (`docs/`).

### 10 Eylül'de sıradaki adım olarak yazılanlar (tamamlandı)

1. **`helm list -n tenant-shenzhen` → APP VERSION v1.19.0 mu?**
   Değilse: `cd /root/teknikerp && git pull && bash k8s/update-all-tenants.sh v1.19.0 shenzhen`
   **Bu şart:** eski sürümle Excel yüklenirse 5.700 ürünün hepsi
   okunmayan `SK...` kodu alır.
2. Kullanıcı Excel'i hazırlıyor: `Id` ve `StokKodu` sütunları
   **tamamen boş**, dosya **Kategori'ye göre sıralı**.
   Arşiv kopyası: `eski-kodlar-2026-09-10.xlsx` (eski 7 haneli kodların
   `StokAdi` üzerinden eşleşme tablosu).
3. Uygulamadan Stok Listesi → Excel Yükle. Bildirimde
   `Excel senkron: <n> yeni, 0 güncellendi, ...` yazmalı.
4. Yükleme sonrası kontrol (tek satır):

```bash
kubectl exec -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t -e "SELECT COUNT(*) urun, SUM(LENGTH(sku)=8) yeni_bicim, SUM(LENGTH(sku)<>8) bicim_disi, COUNT(*)-COUNT(DISTINCT name) mukerrer_ad, COUNT(DISTINCT LEFT(sku,3)) onek FROM Product WHERE deletedAt IS NULL"'
```

   Beklenen: `bicim_disi = 0`, `mukerrer_ad = 0`, `yeni_bicim = urun`.

5. Deneme satışı kes → sil (stok geri dönüyor mu), fiyat listesi
   sitesini aç (iki dakika sonra ürünler geliyor mu).

### Neden sıfırladık — 9 Eylül mükerrer olayı

9 Eylül'de canlıya, sistemden indirilmemiş bir Excel yüklendi. Dosyada
`Id` ve `StokKodu` sütunları boştu. Eşleştirme yapılamayınca program
**481 satırın hepsini yeni ürün olarak açtı**; 479'u zaten var olan bir
kartla aynı addaydı. Ürün sayısı 5278 → 5759 oldu ve stok iki karta
bölündü.

Kalıcı kural: **yüklenecek Excel her zaman programdan indirilmiş
olmalı.** Kodlar dolu geldiği sürece mükerrer imkânsız.

### v1.19.0 ne getirdi

Excel yüklemesi kodu boş satırlara `generateSku()` ile
`SKMRN9SYQ1NNRN` biçiminde 14-16 karakterlik kod atıyordu: okunmuyor,
telefonda söylenmiyor. "Stok Kartı Oluştur" ekranı zaten kategori
önekli 8 karakterlik biçimi üretiyordu — aynı programda iki kod biçimi
dolaşıyordu.

Artık üçü de aynı biçimi üretir: **kategori öneki + 5 hane.**

```
EKRAN & LCD → EKR00001    BATARYA        → BAT00001
KASA & KAPAK → KAS00001   DOKUNMATİK&CAM → DOK00001
TAMİR GEREÇLERİ → TAM00001  ELEKTRONİK   → ELE00001
ENTEGRE & ÇİP → ENT00001  AKSESUAR       → AKS00001
YEDEK PARÇA → YED00001    (kategorisiz)  → GEN00001
```

Sıra numarası her satırda veritabanına sorulmaz (yeni kayıtlar henüz
yok, hepsi aynı numarayı alırdı); sayaçlar bir kez tohumlanır
(veritabanındaki kodlar + dosyadaki dolu kodlar) ve bellekte artar.
Kullanıcının elle yazdığı `EKR00007` ile çakışmaz.
`renumberSkus` çalıştırmaya artık gerek yok.

Doğrulama: `backend/prisma/excel-kod-test.ts` (yerel MySQL kabıyla).

---

## 1. Şu an ne çalışıyor

| Adres | Ortam | Sürüm | Ne için |
|---|---|---|---|
| `teknik.shenzhenmarket.com.tr` | **CANLI MÜŞTERİ** | **v1.21.4** | Shenzhen Market — 12 Eylül'de gerçek kullanım başladı |
| `liste.shenzhenmarket.com.tr` | **CANLI** | fiyat **v1.6.0** | Müşterinin kendi müşterilerine gönderdiği açık fiyat listesi |
| `test.shenzhenmarket.com.tr` | Prova | v1.21.4 | Güncellemeler önce burada denenir |
| `shenzhen-test-liste.derneklab.com` | Prova | fiyat **v1.6.0** | Fiyat listesi provası |
| `demo-erp.derneklab.com` | Vitrin | v1.9.2 | Müşteriye ürün gösterme |

Namespace'ler ayrı: ayrı veritabanı, ayrı disk, ayrı şifre. ERP ve fiyat
listesi aynı namespace'te yaşar ama **ayrı helm release**, ayrı imaj,
ayrı sürümdür.

**Canlı 8 Eylül'de v1.9.2'den v1.15.0'a çıkarıldı** — arada altı sürüm ve
bir şema değişikliği (v1.12.0) vardı, sorunsuz geçti. Müşterinin isteğiyle
yedek adımı atlandı; gecelik yedek zaten çalışıyordu.

---

## 2. Kaynaklar

```
GitHub    : orhaneymur/teknik-erp   ERP (tek dal: main)
            orhaneymur/liste-erp    Fiyat listesi (ayrı ürün, ayrı sürüm)
            orhaneymur/akgunnew     ARŞİV
            orhaneymur/akgunteknik  ARŞİV (Laravel, terk edilmiş)
            orhaneymur/caritakip    ARŞİV

DockerHub : since1907/teknikerp-backend    v1.9.0 … v1.15.0
            since1907/teknikerp-frontend   v1.9.0 … v1.15.0
            since1907/teknikfiyat          v1.0.0 … v1.3.0
            (bestpool-*, fourseason başka projeler — dokunma)

Sunucu    : 213.238.168.227  port 23422  kullanıcı root
            k3s
            /root/teknikerp    ERP chart'ı
            /root/teknikfiyat  fiyat listesi chart'ı
```

### Çalışma klasörü

```
Bilgisayarda : ~/Desktop/teknik-erp     ERP
               ~/Desktop/Fiyat Liste  fiyat listesi
Sunucuda     : /root/teknikerp        ERP
               /root/teknikfiyat      fiyat listesi
```

Her oturum başı `git pull`, iş bitince `git push`.
Sunucuda script çalıştırmadan önce mutlaka `git pull`.

---

## 3. 31 Ağustos'ta yapılanlar

### Altyapı

- Akgün'ün eski kurulumu (`default` namespace) **kaldırıldı**; verisi
  doğrulanarak `tenant-shenzhen`'e taşındı — 5278 ürün, 181 müşteri,
  75 fatura, birebir tuttu
- `akgun.derneklab.com` kapatıldı, tek adres `teknik.shenzhenmarket.com.tr`
- Sunucudan ~2 GB temizlendi (lafed, test2, test3, dernek-app, eski MySQL)
- Prova ortamı `tenant-shenzhen-test` kuruldu, canlının kopyasıyla
- GitHub'da 3 repo arşivlendi, DockerHub'da eski `akgun-*` imajları silindi
- `tenants/` klasörü açıldı — müşteri ayarlarının kaydı
- Chart'taki adres kalıbı düzeltildi (tek seviyeli adres, HTTPS çalışsın)

### Uygulama — v1.10.0 … v1.13.2

25 madde tamamlandı. Ayrıntı için commit mesajlarına bak:

```
bc7de43  v1.10.0  gunluk kullanim (scroll, fis sonrasi sayfada kalma,
                  adet odagi, satis yapan kilidi, Satis1/Satis2,
                  Excel siralama+filtre, menu birlestirme, sehir)
a446de1  v1.11.0  Excel silmiyor, GelenAdet sutunu, kisa stok kodlari,
                  Id ile eslestirme
80422d5  v1.12.0  cari kodu kapali, yetkili=personel, zorunlu alanlar,
                  model->marka bagi (SEMA DEGISIKLIGI)
f56efc0  v1.13.0  Satis Kirilimi raporu, fis puntolari, firma bilgisi uste
6a765e9  v1.13.1  renumberSkus duzeltmesi, chart surumu otomatik
c0f5638  v1.13.2  kod yenileme yalnizca eski otomatik kodlara,
                  surum yazisi tek yerde
```

---

## 4. BEKLEYEN İŞLER

### v1.14.1 provaya alındı (8 Eylül)

İçindekiler: Excel dosya adında firma kısaltması + tarih-saat, iade
faturasına kalem ekleme, Çin iade deposu düzeltmesi, Satış 1 = TOPTAN /
Satış 2 = PERAKENDE, **tüm API uçlarına kimlik doğrulaması**.

Provaya `fileTag: SMT` verildi (revision 7). Zaten firma adı
"Shenzhen Market (TEST)" olduğu için otomatik de SMT üretiliyordu;
firma adı ileride değişirse etiket kaymasın diye sabitlendi.

### Öncelikli

- [x] ~~`renumberSkus --uygula`~~ — **GEREKSİZ KALDI.** v1.19.0 ile Excel
      yüklemesi zaten okunur kod üretiyor; `SK...` biçimli kod artık
      hiç oluşmuyor. Betik duruyor ama çalıştırılacak bir şey yok.
- [ ] **Excel yüklemesine mükerrer ad uyarısı** — aynı hata 9 ve 11
      Eylül'de iki kez oldu ve ikincisinde 5387 ürün ikinci kez açıldı.
      Kod eşleşmeyi yalnızca `Id` ve `StokKodu` ile yapıyor; ad üzerinden
      bakmıyor. Yükleme ÖNCESİ "dosyadaki N satırın adı mevcut ürünlerle
      aynı, devam edilsin mi?" diye soran bir ekran bu hatayı üçüncü kez
      yaşatmaz. Silme eklenmeyecek — yalnızca uyarı.
- [ ] **Yedekleri sunucu dışına çıkar** — kalan tek gerçek veri riski.
      Gecelik yedek çalışıyor ama canlıyla AYNI diskte duruyor.
      Çözüm: yedek CronJob'unun sonuna `rclone` ile uzak hedef
      (Backblaze B2 en ucuzu, ayda birkaç dolar).
- [ ] **Rol bazlı yetki YOK** — `User.role` alanı var, JWT'ye yazılıyor
      ama kodda tek bir rol kontrolü yok. Giriş yapan her personel
      fatura silebiliyor, maliyet ve kâr raporunu görebiliyor, toplu
      fiyat değiştirebiliyor. En az iki rol gerekli: `admin` / `satis`.
- [ ] **Düz metin şifre karşılaştırması** — login'de bcrypt tutmazsa
      `stored === password` dalına düşülüyor; eski personel şifreleri
      veritabanında düz metin duruyor.
- [ ] **Otomatik test yok** — `npm test` → "no test specified".
      Para hesabı yapan bir yazılımda FIFO ve fatura düzenleme sessizce
      yanlış rakam üretebilecek iki yer.
- [ ] **Repoyu private yap** — 5 dakikalık iş, `akgun_canli_data.sql`
      eski commit'lerde duruyor (181 müşterinin adı, adresi, telefonu,
      vergi no'su herkese açık). Private olunca
      `docs/isletme-notlari.html` de commit edilebilir hale gelir.
- [ ] **Sunucu 8 Eylül'de ~2 saat düştü** — sebebi bilinmiyor. Ping ve
      tüm portlar kapalıydı, k3s değil makine seviyesindeydi; kendi
      kendine geri geldi. `uptime`, `df -h`, `dmesg` bakılmadı.
      Tekrarlarsa Hostixo'ya (sağlayıcı, Bursa) açılacak.
- [ ] **Yedekleri sunucu dışına çıkar** — kalan tek gerçek veri riski.
      Gecelik yedek çalışıyor ama aynı diskte duruyor.
- [ ] **Geçmiş Çin iade faturalarını denetle** — düzenlenmiş iadelerde
      stok yanlış depoya işlemiş olabilir (yukarıdaki düzeltmeden önce).
      `CIN_IADE_DEPO` bakiyesi ile iade kayıtlarını karşılaştıran bir
      kontrol sorgusu yazılacak; düzeltme elle yapılacak.

### Fiyat Listesi sitesi — YAYINDA, geliştirme beklemede

`liste.shenzhenmarket.com.tr` canlıda çalışıyor (fiyat v1.3.0).
8 Eylül'de müşteri kararıyla **beklemeye alındı**; ERP işlerine dönüldü.
Ayrıntı ve kalan işler: bu belgenin 8. bölümü.

### Bekleyen malzeme

- [ ] **Logo dosyası** — fişteki yer hazır (`tenant.logoUrl`), şu an kesik
      çizgili `LOGO` yer tutucusu basılıyor. Dosya gelince yalnızca
      ConfigMap güncellenir; kod değişmez, sürüm çıkmaz.
      İstenen: saf siyah-beyaz PNG, ~512 piksel genişlik (termal kafa
      1 bit basar, gri tonlu logo lekeli çıkar).
- [ ] **Kategori temizliği** — 3 boş kategori silinecek: `a` (hatalı),
      `iPhone Yedek Parça`, `APPLE`. 14 ürün kategorisiz.
- [ ] **Marka adına yapışmış tedarikçi** — `SAMSUNG-ALKINDUS` 109,
      `XIAOMI-ALKINDUS` 124, `APPLE-ALKINDUS` 91, `HUAWEI-ALKINDUS` 55,
      `TECNO-ALKINDUS` 48 (toplam ~427 ürün). Fiyat listesinde ayrı marka
      olarak görünürler — müşteri "SAMSUNG" ve "SAMSUNG-ALKINDUS" diye iki
      kutu görür. Tek `UPDATE` ile çözülür.
- [ ] **Kurun gömülü yedeği eskiyor** — TCMB ve ECB'ye birden
      ulaşılamazsa `index.ts`'teki sabit `FALLBACK_USD = 46.39` devreye
      girer. Artık bu rakam müşterinin eline geçen fişe basılıyor. Fişte
      kur dipnot olarak yazdığı için gözden kaçmaz ama sabitin zamanla
      kayacağı akılda tutulmalı.
- [ ] **`YEDEK PARÇA` kovası** — 1755 ürün (%33) bu genel kategoride;
      parça tipi söylemiyor. Fiyat listesinde bu dala girince tek uzun
      liste çıkar. Bölmek işi durdurmaz, sonra yapılabilir.

> **Not (8 Eylül):** Bu belgede daha önce "kategori tek: iPhone Yedek
> Parça" yazıyordu, YANLIŞTI. Canlıda 9 gerçek kategori var ve 5278
> üründen 5264'ü kategorili: `EKRAN & LCD` 1581, `KASA & KAPAK` 1262,
> `BATARYA` 314, `DOKUNMATİK & CAM` 251, `TAMİR GEREÇLERİ` 78,
> `ELEKTRONİK` 13, `ENTEGRE & ÇİP` 7, `AKSESUAR` 3. Marka 5178,
> model 5155 üründe dolu.

### Ertelenenler

- [ ] **Repo private + geçmiş temizliği** — `akgun_canli_data.sql` güncel
      halden çıkarıldı ama **eski commit'lerde duruyor**; 181 müşterinin
      adı, adresi, telefonu, vergi no'su herkese açık
- [ ] **Rancher kaldırma** — ~1 GB kazandırır, zorunlu değil.
      31 Ağustos'ta denendi, kesinti yarattı — bkz. aşağıdaki uyarı
- [ ] **Firma bazlı özellik bayrakları** — altyapı hazır (`config.json`),
      ilk özel istek geldiğinde eklenecek

---

## 5. Tuzaklar — tekrar etmesin

**Rancher kaldırma (31 Ağu'da kesinti yarattı).**
İki hata yapıldı: (1) `rancher` pod'u çalışırken parçaları silinmeye
çalışıldı, o da hepsini geri kurdu — önce `kubectl scale deploy/rancher
--replicas=0` gerekiyor. (2) CRD silme kalıbı `cattle.io` içerenleri
hedefledi, ama **`helm.cattle.io` k3s'e aittir**; silinince traefik kalktı
ve tüm siteler kapandı. Kurtarma: `systemctl restart k3s`.
CRD silerken korunacaklar: `helm.cattle.io`, `traefik.io`, `k3s.cattle.io`.

**Aynı şeyin iki kopyası.** Bu projedeki hataların çoğu buradan çıktı:
düzeltme bilgisayarda, sunucu eski kodla çalışıyor. Kural: GitHub tek
doğru kaynak, sunucu `git pull` ile ondan beslenir.

**"Yedek aldım" yetmez.** 28 Ağustos'ta alınan yedek tüm testleri geçti
(dosya var, gzip sağlam, "Dump completed" yazıyor) ama **yanlış
veritabanındandı**. Yakalayan tek şey satır sayılarını canlıyla
karşılaştırmak oldu.

**Şema, migration kaydından ileride olabilir.** Akgün'de kolonlar elle
eklenmiş, `_prisma_migrations`'a yazılmamıştı; `migrate deploy`
"Duplicate column" ile çakıldı. Çözüm: önce varlığı ölç, sonra
`prisma migrate resolve --applied`.

**Adres tek seviye olmalı.** `x-erp.derneklab.com` ✓ /
`x.erp.derneklab.com` ✗ — Cloudflare ücretsiz sertifikası ikincisini
kapsamaz, site HTTPS'te hiç açılmaz.

---

## 6. Sık kullanılan komutlar

```bash
# Durum
kubectl get pods -A
helm list -A
kubectl get ingress -A

# Yeni surum cikar
cd ~/Desktop/teknik-erp
bash k8s/build-images.sh v1.14.0

# Once PROVA
ssh -p 23422 root@213.238.168.227 "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; cd /root/teknikerp && git pull && bash k8s/update-all-tenants.sh v1.14.0 shenzhen-test"

# Sonra CANLI
... update-all-tenants.sh v1.14.0 shenzhen

# Geri al
helm rollback teknikerp -n tenant-shenzhen
helm upgrade teknikerp charts/teknikerp -n tenant-shenzhen --reuse-values --set image.tag=v1.13.2

# Yeni musteri — ERP + fiyat listesi birlikte kurulur
# Once Cloudflare A kayitlari (ikisi de Proxied):
#   <ad>-erp  -> 213.238.168.227      (musterinin kendi alan adi yoksa)
#   liste     -> 213.238.168.227      (musterinin alan adinda)
cd /root/teknikerp && git pull
cd /root/teknikfiyat && git pull
cd /root/teknikerp
FIYAT_ALAN=liste.musteri.com.tr bash k8s/new-tenant.sh xyzoto "XYZ Oto Elektrik"

# Yalnizca fiyat listesi (ERP zaten kurulu)
cd /root/teknikfiyat && git pull
bash k8s/kur.sh shenzhen "Shenzhen Market" liste.shenzhenmarket.com.tr

# Fiyat listesi yeni surum (ERP'den BAGIMSIZ)
cd /root/teknikfiyat
bash k8s/tum-musteriler.sh v1.0.1 shenzhen-test   # once prova
bash k8s/tum-musteriler.sh v1.0.1                 # sonra hepsi
```

Şifreler için: `SIFRELER.md`
Mimari ve müşteri düzeni için: `SAAS.md`, `tenants/README.md`

---

## 7. Kapasite

```
Sunucu   7.8 GB RAM  |  ~2.5 GB bos  |  musteri basina ~600-800 MB
```

Fiyat listesi müşteri başına ~150-250 MB daha ekler (ayrı pod). İkisi
birlikte ~800 MB-1 GB eder, yani **2-3 müşteri daha sığar.** Rancher
kaldırılırsa bir tane daha. Ondan sonra RAM yükseltmek veya ikinci
sunucu gerekir — satış yaparken bilinmesi gereken sınır.

---

## 8. Fiyat Listesi sitesi — YAYINDA, beklemede

`liste.shenzhenmarket.com.tr` · fiyat **v1.3.0** · depo
`orhaneymur/liste-erp` · imaj `since1907/teknikfiyat`

Müşterinin **kendi müşterilerine** link olarak gönderdiği açık fiyat
sitesi. ERP alan her firmaya ücretsiz ve varsayılan olarak kurulur;
ERP'siz satılmaz.

**8 Eylül'de müşteri kararıyla beklemeye alındı.** Çalışıyor; geliştirme
sonra sürecek.

### Kararlar (8 Eylül 2026)

| Konu | Karar |
|---|---|
| Veri kaynağı | ERP veritabanı, otomatik. Excel yok, panel yok |
| Kod | **Ayrı depo, ayrı imaj, ayrı sürüm** — ERP'nin içinde değil |
| Adres | `liste.<müşteri alan adı>`; yoksa `<ad>-liste.derneklab.com` |
| Erişim | Herkese açık, giriş yok. Bayi platformu ileride ayrı iş |
| Para birimi | USD (ERP'deki gibi), çevrim yok |
| Gösterilen | Toptan + perakende |
| Stok | **Var / Yok** — iki durum, adet gösterilmez |
| Stokta yoksa | **Fiyatı gizlenir**, satır listenin sonuna düşer |
| Model listesi | Fiyat gösterilmez, yalnız model adı |
| Tema | Koyu — müşteri açık temayı beğenmedi |
| Kurulum | `new-tenant.sh` iki siteyi birden kurar |

### Nasıl çalışıyor

```
ERP veritabanı
      ↓
teknikerp-backend :  GET /api/public/fiyat-listesi   (kimliksiz, salt okuma)
      ↓                     ↑ aynı namespace, küme içi
teknikfiyat pod   :  Next.js, listeyi indeksleyip 60 sn önbellekler
      ↓
liste.shenzhenmarket.com.tr
```

Aradaki tek bağ bu HTTP ucudur — kod paylaşımı yok. ERP'ye sürüm atmak
fiyat listesini etkilemez, tersi de geçerli.

**Ucun sınırı güvenliğin kendisi:** açık olduğu için sorgusu bilerek dar.
Maliyet (`costPrice`), RMB fiyatı, stok adedi, açıklama, müşteri ve
fatura verisi sorgunun içinde hiç yok. Stok yalnızca `MERKEZ_DEPO`'dan
sayılır — `CIN_IADE_DEPO`'daki mal Çin'e geri gidecek arızalı maldır.

### Sürüm geçmişi

```
v1.0.0  ilk yayın — ERP'den beslenen liste, Excel ve panel kaldırıldı
v1.0.1  hız: 1,4 sn -> ~20 ms (önbellekli indeks, force-dynamic kalktı)
v1.1.0  açık tema denemesi — MÜŞTERİ BEĞENMEDİ
v1.2.0  koyu temaya dönüş, rafine edildi; ikonlar büyütüldü
v1.2.1  arama bozuktu (await unutulmuş), düzeltildi
v1.3.0  stokta olmayanın fiyatı gizli, model listesinden fiyat kalktı
v1.4.0  satırlar stok adıyla, muadil modeller listede  (provaya kaldı)
v1.5.0  sağ altta WhatsApp düğmesi, uyumlu modeller tıklanabilir
```

**WhatsApp numarası ConfigMap'ten gelir** (`tenant.whatsapp`), koda
gömülü değildir. Shenzhen için `+90 530 889 34 00` verildi.

**Fiyat listesinde görünmeyen ürünler (10 Eylül tespiti):** uç,
kategorisi/markası/modeli boş olan ve iki satış fiyatı da 0 olan
ürünleri eler. Sıfırlama öncesi 5.759 aktif üründen 127'si eleniyordu:
123'ü modele bağlı olmayan tamir gereci ve sarf malzemesi
(**karar: görünmesinler**), 13'ü Excel'de kategorisi boş kalmış veri
hatası.

### Öğrenilenler

**Hız neredeydi.** Sayfa başına dokuz veri çağrısı ve her çağrıda 5152
ürünün baştan taranması. Çözüm: listeyi bir kez çekip önbellekli bir
indekse çevirmek. `layout.tsx`'teki `force-dynamic` de Excel
döneminden kalmıştı, her isteği sıfırdan ürettiriyordu.

**`await` unutmak TypeScript'e yakalanmıyor.** `NextResponse.json` her
türü kabul ettiği için `{ sonuclar: modelAra(q) }` derlenip geçti ve
arama v1.0.1'den v1.2.1'e kadar canlıda bozuk kaldı.

**Tasarım turu.** İlk koyu tema "yapay zeka gibi" bulundu; tamamen sade
açık tema ise "bembeyaz, aşırı sade". Kabul edilen yol: **koyu temayı
koruyup rafine etmek** — gradyanı üç noktaya toplamak, yüzeylere üst
kenar ışığı vermek, rakamları mono yapmak, giriş animasyonlarını atmak.
Yeni bir görsel yön denemeden önce önizleme çıkarmak zaman kazandırdı.

### Kalan işler (beklemede)

- [ ] Müşterinin tasarım geri bildirimi — ikon boyutları, tablo düzeni
- [ ] Toptan ve perakende çoğu üründe AYNI (ERP'de Satış 2 girilmemiş,
      Satış 1 kopyalanmış). Aynı rakam iki sütunda duruyor; perakendeyi
      kapatmak (`--set tenant.perakendeGoster=false`) daha temiz olabilir
- [ ] Marka adlarındaki `-ALKINDUS` eki ve `YEDEK PARÇA` kovası
      listede doğrudan görünüyor (bkz. 4. bölüm)
- [ ] Demo tenant'ına da kurulsun mu (vitrin için)
- [ ] Prova ortamı `shenzhen-test-liste.derneklab.com` ayakta; canlıya
      çıkmadan önce sürümler burada denenmeli
