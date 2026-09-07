# Durum ve Devam Notu

Son güncelleme: **7 Eylül 2026**

Bu belge "nerede kaldık, sırada ne var" sorusunu cevaplar. Yeni bir
oturuma başlarken önce buraya bak.

---

## 1. Şu an ne çalışıyor

| Adres | Ortam | Sürüm | Ne için |
|---|---|---|---|
| `teknik.shenzhenmarket.com.tr` | **CANLI MÜŞTERİ** | **v1.9.2** | Shenzhen Market — gerçek kullanım |
| `test.shenzhenmarket.com.tr` | Prova | v1.14.0 | Güncellemeler önce burada denenir |
| `demo-erp.derneklab.com` | Vitrin | v1.9.2 | Müşteriye ürün gösterme |

Üçü de ayrı namespace, ayrı veritabanı, ayrı disk, ayrı şifre.
Aynı iki Docker imajını çalıştırırlar; fark yalnızca ayardadır.

**Canlı sistem v1.9.2'de.** 31 Ağustos'ta yazılan v1.10–v1.13
güncellemeleri henüz canlıya alınmadı (bilinçli erteleme).

---

## 2. Kaynaklar

```
GitHub    : orhaneymur/teknik-erp   (tek aktif repo, tek dal: main)
            orhaneymur/akgunnew     ARŞİV
            orhaneymur/akgunteknik  ARŞİV (Laravel, terk edilmiş)
            orhaneymur/caritakip    ARŞİV

DockerHub : since1907/teknikerp-backend    v1.9.0 … v1.13.2
            since1907/teknikerp-frontend   v1.9.0 … v1.13.2
            (bestpool-*, fourseason başka projeler — dokunma)

Sunucu    : 213.238.168.227  port 23422  kullanıcı root
            k3s, /root/teknikerp = tek chart kopyası
```

### Çalışma klasörü

```
Bilgisayarda : ~/Desktop/teknik-erp
Sunucuda     : /root/teknikerp
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

### Sırada — kod yazıldı, imaja girmedi

v1.14.0 imajı çıktıktan SONRA yazıldı; bir sonraki sürümde (v1.14.1)
provaya gidecek:

- [ ] **Excel dosya adı** — indirilen dosya `SM-stoklar-20260907-1432.xlsx`
      biçiminde iner (firma kısaltması + tarih-saat)
- [ ] **İade faturasına kalem ekleme** — müşteri ekstresinden açılan iade
      faturasına artık ürün eklenebiliyor
- [ ] **Çin iade deposu düzeltmesi** — fatura düzenleme ucu satır bazlı
      "Çin iade" tikini görmüyordu, her değişikliği MERKEZ_DEPO'ya
      yazıyordu

### Öncelikli

- [ ] **Provada v1.14.0'ı gözden geçir** — klavye akışı, virgüllü fiyat,
      yeşil kayıt şeridi, muadil önerisi. `test.shenzhenmarket.com.tr`
- [ ] **Prova ortamına ayrı `fileTag`** — prova ile canlı aynı firma adını
      taşıdığı için indirilen dosyalar da aynı adla iniyor. Provaya
      `tenant.fileTag: "SMT"` verilirse karışma riski kalkar.
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

### Fiyat Listesi sitesi — YENİ PROJE

Her müşteriye ERP'nin yanında ikinci bir site: müşterinin kendi
müşterilerine göndereceği fiyat listesi. Kaynak `~/Desktop/Fiyat Liste`
(Next.js 16, Cursor ile yazıldı, temiz derleniyor).

Kararlar ve adımlar için ayrıntı: bu belgenin 8. bölümü.

### Bekleyen malzeme

- [ ] **Logo** — fişe eklenecek, dosya bekleniyor
- [ ] **Kategori temizliği** — `a` adlı hatalı kategori, iki boş kategori
      (`iPhone Yedek Parça`, `APPLE`), 14 kategorisiz ürün

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

# Yeni musteri  (once Cloudflare A kaydi: <ad>-erp -> 213.238.168.227, Proxied)
cd /root/teknikerp && git pull
bash k8s/new-tenant.sh xyzoto "XYZ Oto Elektrik"
```

Şifreler için: `SIFRELER.md`
Mimari ve müşteri düzeni için: `SAAS.md`, `tenants/README.md`

---

## 7. Kapasite

```
Sunucu   7.8 GB RAM  |  ~2.5 GB bos  |  musteri basina ~600-800 MB
```

Yaklaşık 3-4 müşteri daha sığar. Rancher kaldırılırsa bir tane daha.
Ondan sonra RAM yükseltmek veya ikinci sunucu gerekir — satış yaparken
bilinmesi gereken sınır.

---

## 8. Fiyat Listesi sitesi — açık kararlar ve plan

Hedef: müşteriyle anlaşınca **iki site birden** kurulur — ERP ve fiyat
listesi. Fiyat listesi, müşterinin kendi müşterilerine link olarak
gönderdiği, kategori altında Satış 1 / Satış 2 fiyatlarını gösteren
sitedir.

### Elimizdeki uygulama

`~/Desktop/Fiyat Liste` — Next.js 16 / React 19 / Tailwind 4, TypeScript.
`next build` temiz geçiyor. Şu anki hâli:

- Veri **tek bir JSON dosyasında** (`veri/fiyatlar.json`), veritabanı yok
- Excel yükleyerek doldurulur; şablon indirme ve dışa aktarma var
- Gezinme: Marka → Kategori → Model → fiyat tablosu, ayrıca arama
- Yönetim paneli tek şifreyle (`ADMIN_SIFRE`, **varsayılanı `admin123`**)
- Ayarlar: firma adı, telefon, WhatsApp, KDV, kur, hangi fiyat görünsün
- Örnek veri: 2520 satır, 13 marka, 9 kategori, hepsi TRY

### Karar bekleyen konular

1. **Veri kaynağı.** Site ERP veritabanından mı beslensin (otomatik),
   ERP'den indirilen Excel elle mi yüklensin, yoksa ERP'ye "fiyat
   sitesine gönder" düğmesi mi konsun?
2. **Kategori boşluğu.** Sitenin ağacı parça tipi ister (Ekran, Batarya).
   ERP'de kategori tek: "iPhone Yedek Parça"; parça tipi yalnızca ürün
   adının içinde geçiyor. Bu çözülmeden ERP verisi siteyi besleyemez.
3. ~~Satış 1 / Satış 2 hangisi toptan?~~ **KARARLAŞTI (7 Eylül):**
   Satış 1 = TOPTAN, Satış 2 = PERAKENDE. Tüm ekran etiketleri, Excel
   yorumları ve satış ekranındaki varsayılan kademe buna göre düzeltildi.
4. **Para birimi.** ERP tamamen USD; site TRY/USD/EUR destekliyor.
   Müşteriye hangisi gösterilecek, TL ise kur nereden?
5. **Site herkese açık mı?** Toptan fiyat ticari sırdır.
6. **Stok görünsün mü?** Rakam mı, "Var/Sınırlı/Yok" mu, hiç mi?
7. **Hangi ürünler yayınlanacak?** Hepsi mi, yoksa bir "yayınla" bayrağı
   mı gerekir?

### Yapılacaklar (kararlardan sonra)

- [ ] Klasörü sürüm kontrolüne al (ayrı repo mu, teknik-erp içinde mi)
- [ ] `veri/fiyatlar.json` repoya girsin mi — içinde müşteri fiyatı var
- [ ] `output: 'standalone'` ekle + çok aşamalı Dockerfile yaz
- [ ] DockerHub'a it (`since1907/teknikfiyat-*`)
- [ ] Helm chart'a ikinci deployment + service + ingress + kalıcı disk
- [ ] `ADMIN_SIFRE` ve `OTURUM_ANAHTARI` Secret'a taşınsın —
      **`admin123` asla canlıya gitmemeli**
- [ ] Firma adı/iletişim ConfigMap'ten gelsin (ERP'deki `config.json`
      kalıbının aynısı), her müşteri kendi ayarını taşısın
- [ ] `new-tenant.sh` iki siteyi birden kursun
- [ ] Adres kalıbı: tek seviye olmak zorunda (Cloudflare sertifikası) —
      `<ad>-fiyat.derneklab.com`
- [ ] ERP → site veri akışı (1. karara göre)
- [ ] Kategori çözümü (2. karara göre)

### Kapasite etkisi

Sunucuda ~2.5 GB boş. Next.js sunucusu müşteri başına ~150-250 MB ekler.
Tek siteyle 3-4 müşteri sığıyordu; **ikişer siteyle 2-3'e düşer.** Satış
yaparken bilinmesi gereken yeni sınır budur.
