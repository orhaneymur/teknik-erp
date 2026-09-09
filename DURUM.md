# Durum ve Devam Notu

Son güncelleme: **10 Eylül 2026**

Bu belge "nerede kaldık, sırada ne var" sorusunu cevaplar. Yeni bir
oturuma başlarken önce buraya bak.

---

## 0. TAM ŞU AN NEREDE KALDIK

> **12 EYLÜL CUMARTESİ SABAHI SHENZHEN MARKET GERÇEK SATIŞA BAŞLIYOR.**
> Bugüne kadar hep test yapıyorlardı. Bu tarihe kadar yapılan her şey
> o sabahı hazırlamak içindir.

### Yapıldı (10 Eylül)

- **Canlı veritabanı SIFIRLANDI.** Sunucudan elle SQL ile:
  ürün / fatura / kalem / stok / katman / kategori / marka-model = **0**,
  **181 müşteri kartı korundu**, cari ve kasa bakiyeleri 0'landı,
  3 şube (Merkez Şube + 2 depo) duruyor.
- Sıfırlamadan önce yedek alındı:
  `/root/shenzhen-sifirlama-oncesi-2026-09-09-2203.sql.gz` (270 KB)
- **ERP v1.19.0** derlendi ve Docker Hub'a gönderildi.
- Müşteri kılavuzu ve dahili işletme notları yazıldı (`docs/`).

### Sıradaki adım

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
| `teknik.shenzhenmarket.com.tr` | **CANLI MÜŞTERİ** | **v1.19.0** (kurulum teyit edilmeli) | Shenzhen Market — 12 Eylül'de gerçek kullanım başlıyor |
| `liste.shenzhenmarket.com.tr` | **CANLI** | fiyat **v1.5.0** | Müşterinin kendi müşterilerine gönderdiği açık fiyat listesi |
| `test.shenzhenmarket.com.tr` | Prova | v1.19.0 | Güncellemeler önce burada denenir |
| `shenzhen-test-liste.derneklab.com` | Prova | fiyat **v1.4.0** — canlının GERİSİNDE | Fiyat listesi provası |
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

- [ ] **Logo** — fişe eklenecek, dosya bekleniyor
- [ ] **Kategori temizliği** — 3 boş kategori silinecek: `a` (hatalı),
      `iPhone Yedek Parça`, `APPLE`. 14 ürün kategorisiz.
- [ ] **Marka adına yapışmış tedarikçi** — `SAMSUNG-ALKINDUS` 109,
      `XIAOMI-ALKINDUS` 124, `APPLE-ALKINDUS` 91, `HUAWEI-ALKINDUS` 55,
      `TECNO-ALKINDUS` 48 (toplam ~427 ürün). Fiyat listesinde ayrı marka
      olarak görünürler — müşteri "SAMSUNG" ve "SAMSUNG-ALKINDUS" diye iki
      kutu görür. Tek `UPDATE` ile çözülür.
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
