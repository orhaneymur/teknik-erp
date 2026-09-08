# Durum ve Devam Notu

Son güncelleme: **8 Eylül 2026**

Bu belge "nerede kaldık, sırada ne var" sorusunu cevaplar. Yeni bir
oturuma başlarken önce buraya bak.

---

## 1. Şu an ne çalışıyor

| Adres | Ortam | Sürüm | Ne için |
|---|---|---|---|
| `teknik.shenzhenmarket.com.tr` | **CANLI MÜŞTERİ** | **v1.9.2** | Shenzhen Market — gerçek kullanım |
| `test.shenzhenmarket.com.tr` | Prova | v1.14.1 | Güncellemeler önce burada denenir |
| `demo-erp.derneklab.com` | Vitrin | v1.9.2 | Müşteriye ürün gösterme |

Üçü de ayrı namespace, ayrı veritabanı, ayrı disk, ayrı şifre.
Aynı iki Docker imajını çalıştırırlar; fark yalnızca ayardadır.

**Canlı sistem v1.9.2'de.** 31 Ağustos'ta yazılan v1.10–v1.13
güncellemeleri henüz canlıya alınmadı (bilinçli erteleme).

---

## 2. Kaynaklar

```
GitHub    : orhaneymur/teknik-erp   ERP (tek dal: main)
            <fiyat listesi deposu>  HENÜZ İTİLMEDİ — yerelde
            orhaneymur/akgunnew     ARŞİV
            orhaneymur/akgunteknik  ARŞİV (Laravel, terk edilmiş)
            orhaneymur/caritakip    ARŞİV

DockerHub : since1907/teknikerp-backend    v1.9.0 … v1.14.1
            since1907/teknikerp-frontend   v1.9.0 … v1.14.1
            since1907/teknikfiyat          HENÜZ İTİLMEDİ
            (bestpool-*, fourseason başka projeler — dokunma)

Sunucu    : 213.238.168.227  port 23422  kullanıcı root
            k3s
            /root/teknikerp    ERP chart'ı
            /root/teknikfiyat  fiyat listesi chart'ı (henüz yok)
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

- [ ] **Provada v1.14.1'i gözden geçir** — klavye akışı, virgüllü fiyat,
      yeşil kayıt şeridi, muadil önerisi, giriş yapmadan sayfa açılmıyor
      mu. `test.shenzhenmarket.com.tr`
- [ ] **Canlı geçiş** — onaydan sonra. Sırası:
      1. Canlı DB yedeği al ve doğrula
      2. `update-all-tenants.sh <surum> shenzhen`
      3. Veri sayılarını doğrula, site 200 mü
      4. **Ayrı adım:** `renumberSkus --uygula`, çıktıyı SAKLA
- [ ] **Yedekleri sunucu dışına çıkar** — kalan tek gerçek veri riski.
      Gecelik yedek çalışıyor ama aynı diskte duruyor.
- [ ] **Geçmiş Çin iade faturalarını denetle** — düzenlenmiş iadelerde
      stok yanlış depoya işlemiş olabilir (yukarıdaki düzeltmeden önce).
      `CIN_IADE_DEPO` bakiyesi ile iade kayıtlarını karşılaştıran bir
      kontrol sorgusu yazılacak; düzeltme elle yapılacak.

### Fiyat Listesi sitesi — kod hazır, yayına alınmadı

Kararlar verildi ve kod yazıldı; ayrıntı için bu belgenin 8. bölümü.
Kalan: iki depoyu GitHub'a itmek, imajı Docker Hub'a atmak, provaya
kurup denemek.

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

## 8. Fiyat Listesi sitesi

Müşterinin **kendi müşterilerine** link olarak gönderdiği açık fiyat
sitesi. ERP alan her firmaya **ücretsiz ve varsayılan** olarak kurulur;
ERP'siz satılmaz.

### Kararlar (8 Eylül 2026)

| Konu | Karar |
|---|---|
| Veri kaynağı | ERP veritabanı, otomatik. Excel yok, panel yok |
| Kod | **Ayrı depo, ayrı imaj, ayrı sürüm** — ERP'nin içinde değil |
| Adres | `liste.<müşteri alan adı>` — ör. `liste.shenzhenmarket.com.tr` |
| Erişim | Herkese açık, giriş yok. Bayi platformu ileride ayrı iş |
| Para birimi | USD (ERP'deki gibi), çevrim yok |
| Gösterilen | Toptan + perakende |
| Stok | **Var / Yok** — iki durum, "sınırlı" yok, adet gösterilmez |
| Kurulum | `new-tenant.sh` iki siteyi birden kurar |

### Nasıl çalışıyor

```
ERP veritabanı
      ↓
teknikerp-backend :  GET /api/public/fiyat-listesi   (kimliksiz, salt okuma)
      ↓                     ↑ aynı namespace, küme içi
teknikfiyat pod   :  Next.js, 60 sn'de bir tazeler, hiçbir veri saklamaz
      ↓
liste.shenzhenmarket.com.tr
```

Aradaki tek bağ bu HTTP ucudur — kod paylaşımı yok. ERP'ye sürüm atmak
fiyat listesini etkilemez, tersi de geçerli.

**Ucun sınırı güvenliğin kendisi:** açık olduğu için sorgusu bilerek dar.
Maliyet (`costPrice`), RMB fiyatı, stok adedi, açıklama, müşteri ve
fatura verisi sorgunun içinde hiç yok. Stok yalnızca `MERKEZ_DEPO`'dan
sayılır — `CIN_IADE_DEPO`'daki mal Çin'e geri gidecek arızalı maldır.

### Yapıldı

- ERP'ye `GET /api/public/fiyat-listesi` ucu (`teknik-erp` deposu)
- `new-tenant.sh` fiyat listesini de kuruyor (depo yoksa atlıyor)
- Fiyat listesi ERP'den beslenir hale getirildi: panel, giriş, Excel,
  yedek ve kalıcı disk kaldırıldı — **4034 satır silindi, 357 eklendi**
- Kendi Helm chart'ı + `build-images.sh`, `kur.sh`, `tum-musteriler.sh`
- Gerçek imaj, ERP ucunu taklit eden sunucuya bağlanıp denendi:
  dört sayfa 200, tablo doğru bastı (renkler ayrı satır, stok Var/Yok)

### Kalan

- [ ] Fiyat listesi deposunu GitHub'a it
- [ ] `bash k8s/build-images.sh v1.0.0` → `since1907/teknikfiyat`
- [ ] Cloudflare A kaydı: `liste` → `213.238.168.227` (Proxied)
- [ ] Sunucuya `git clone ... /root/teknikfiyat`
- [ ] Provaya kur ve dene:
      `bash k8s/kur.sh shenzhen-test "Shenzhen Market (TEST)"`
- [ ] Canlıya kur: `bash k8s/kur.sh shenzhen "Shenzhen Market" liste.shenzhenmarket.com.tr`
- [ ] Chart'lar yerelde `helm template` ile doğrulanamadı (helm kurulu
      değil) — provada ilk kurulumda dikkatli bak

### Bilinmesi gereken

Marka adlarındaki `-ALKINDUS` eki ve `YEDEK PARÇA` kovası fiyat
listesinde doğrudan görünür (bkz. 4. bölüm, "Bekleyen malzeme").
Veri temizliği yapılana kadar müşteri "SAMSUNG" ve "SAMSUNG-ALKINDUS"
diye iki ayrı marka kutusu görecek.
