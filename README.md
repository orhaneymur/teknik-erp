# Akgün Teknik ERP v1.5

## Proje Özeti

**Akgün Teknik ERP**, eski Laravel monolith yapısından arındırılmış; **Fastify**, **Prisma**, **MySQL** ve **React (Vite + Tailwind v4)** mimarisiyle yazılmış, sunucu dostu hafif ve klavye odaklı akıllı ön muhasebe / ERP sistemidir.

Dükkanın günlük operasyonları — satış, alış, stok, cari, kasa, iade ve raporlama — tek bir monorepo içinde birleştirilmiştir. Canlı veritabanı yedeği (`akgun_canli_data.sql`) repoda tutulur; **16.000+ ürün** ve **180+ müşteri** kaydı ile gerçek veri üzerinde çalışır.

**Canlı ortam:** K3s kümesi · Docker Hub `since1907/akgun-backend:v1.8.13` · `since1907/akgun-frontend:v1.8.34`  
**Giriş:** `akgunteknik` / `123456`

---

## Monorepo Yapısı

```
akgunteknik/
├── backend/              # Fastify 5 + Prisma 7 + TypeScript API (Port: 3000)
├── frontend/             # React 19 + Vite 8 + Tailwind v4 (Port: 5173)
├── k8s/                  # Kubernetes manifestleri (backend, frontend, mysql)
├── akgun_canli_data.sql  # Canlı DB yedeği (~2.7 MB) — yalnızca repoda
├── README.md             # Bu dosya — proje özeti
├── REQUIREMENTS.md       # Gereksinimler ve altyapı detayları
├── RUN_LOCAL_AND_PROD.md # Yerel ve canlı çalıştırma kılavuzu
└── NEXT_STEPS.md         # Sıradaki adımlar ve yol haritası
```

---

## Menü Yapısı (v1.7 — 24 canlı ekran)

Placeholder sayfalar kaldırıldı; sidebar yalnızca çalışan modülleri listeler. **Alt menü öğeleri yeni tarayıcı sekmesinde açılır** — aynı anda satış, alış ve iade yapabilirsiniz.

| Grup | Ekranlar |
|------|----------|
| **Ana Sayfa** | Dashboard (5 hızlı erişim kartı) |
| **Satış İşlemleri** | Satış Yap (F2), Satış İade, **Ön Siparişler** |
| **Alış İşlemleri** | Alış Faturası |
| **Stok İşlemleri** | Stok Listesi, Depo Transfer, **Stok Hareketleri (ürün arama)**, Stok Kartı, Barkod Etiket |
| **Müşteri İşlemleri** | Müşteri Listesi, Tahsilat / Ödeme, Müşteri Bakiye |
| **Raporlar** | İşletme Özeti, Kâr-Zarar, Stok Değeri, Kasa Raporu, Müşteri Ekstre |
| **Tanımlar** | Ürün Tanımları, Kasa Tanımları, Personel Tanımları |
| **Faturalar** | Fatura Listesi (filtre: Tümü / Satış / Alış / İade), **Silinen İşlemler** |

Menü tanımları: `frontend/src/lib/navigation.ts` · URL: `?page=sales`, `?page=pre-orders` vb.

---

## Tamamlanan Modüller

### Dashboard
- Günlük **kasa durumları** (TL / USD kasalar)
- **Son Faturalar** — satış faturalarında fatura no veya göz ikonuna tıklayınca aynı sayfada düzenleme (Fatura Listesi ile aynı akış)
- Son **kasa hareketleri**
- **5 hızlı erişim kartı:** Satış Yap, Alış Faturası, İade Al, Stok Kartı Oluştur, Fatura Listesi

### Hızlı Satış (F2) — v1.7+
- **F2** yalnızca Satış / Alış / İade ekranındayken açılır (sayfa değiştirmez)
- Panel açılınca arama kutusuna **otomatik odaklanır**; klavyeyle doğrudan yazılabilir
- Açılınca **tüm ürünler** listelenir (sayfalı, kaydırınca devamı yüklenir)
- **↑ / ↓** ve **PgUp / PgDn** ile klavyede gezinme; seçili satır otomatik kayar
- **Enter** sepete ekler, **Esc** kapatır
- Müşteri/tedarikçi seçiliyse **son işlem fiyatı** geçerli olur; listede güncel satış fiyatı + “Son fiyat” satırı görünür
- Türkçe karaktere duyarsız arama

### Alış Faturası (Mal Kabul)
- Tedarikçiden mal girişi formu (`PurchaseCreate.tsx`) — **fiyatlar USD ($)** bazlı
- `GET /api/purchases/init` — tedarikçiler, kasalar, bir sonraki fatura no
- `POST /api/purchases/store` — `AF{year}xxxx` numaralı `ALIS` faturası
- **MERKEZ_DEPO** stok artışı ve ürün `costPrice` güncellemesi
- Nakit → kasa düşümü + CIKIS hareketi; Cari → tedarikçi bakiye düşümü

### Satış Yönetimi ve Dövizli Muhasebe

Hızlı Satış ekranı (`SalesCreate.tsx`) esnaf fatura düzenine göre **4 üst blok + akıllı sepet + fintech özet paneli** ile tasarlanmıştır.

#### Evrak ve Müşteri Üst Blokları

| Kutu | Alanlar |
|------|---------|
| **Evrak** | Sipariş No (`SF2026xxxx` önizleme), Fatura Tarihi, Vade Tarihi |
| **Müşteri** | Arama motorlu dropdown, anlık **Limit** ve **Bakiye** (seçim anında API'den) |
| **Ödeme** | EFT/Havale, Nakit, Kart, Cari · Peşin/Vadeli · Banka/Kasa seçimi |
| **Teslimat** | Mağazadan Teslim / Kargo · Sipariş açıklaması (textarea) |

#### Çift Para Birimi Matematik Motoru (v1.8.1 — varsayılan USD)

- **Satış, alış ve iade** ekranlarında fiyat girişi ve toplamlar **USD ($)** bazlıdır; TL yalnızca küçük referans satırı olarak gösterilir
- Kayıt anında API'ye TL gönderilir (`$ × kur`); veritabanı muhasebesi TL üzerinden devam eder
- Sepet satırları: `Fiyat ($)` düzenlenebilir; **maliyet sütunu varsayılan olarak gizlidir**
- **F8 basılı tutulduğunda** maliyet ($) sütunu görünür; tuş bırakılınca veya pencere odaktan çıkınca tekrar gizlenir (yalnızca `keydown`/`keyup` dinleyicisi, ek API yükü yok)
- Satır indirimi: `Toplam = (Adet × Fiyat) × (1 − Ind.% / 100)`
- Sepet satırlarında **← → ↑ ↓** ile İndirim / Adet / Fiyat alanları arasında gezinme (v1.8.11; düzenleme modu dahil)
- **Net Toplam ($)** kırmızı büyük puntoda; **TL Toplam** = `Net Toplam ($) × Döviz Kuru`
- Üst bardaki kur satış panelinde düzenlenebilir input olarak kullanılır
- Müşteri değişince **Son Satın Aldığı Fiyat** otomatik USD'ye çevrilerek satıra yazılır

#### Termal Fiş Yazdırma (72.1mm × 297mm)

**Satış**, **Alış** ve **Satış İade** ekranlarında fiş yazdırma vardır:

- **Fiş Yazdır** butonu (sepet doluyken anında)
- **Kayıttan sonra yazdır** kutusu (yeni kayıt sonrası otomatik)
- Ekran tablosu değil **ayrı termal fiş taslağı**: `@page size: 72.1mm 297mm`, içerik ~68mm
- Her ürün **tek satır**: ürün adı · adet · birim fiyat · satır toplamı

#### Stok Hareketleri Arama

Sayfa açılışında liste boştur. **Stok no (SKU)** veya **stok adı** yazılınca hareketler listelenir (satış / alış / iade).

#### Stok Listesi — Ürün Düzenleme / Silme

Excel dışında ekrandan da yönetim:

- Ürün adına tıklayınca veya kalem ikonu ile **düzenleme** (ad, SKU, barkod, marka, model, fiyat, açıklama, depo stokları)
- **Sil** — faturada kullanılmamış ürünler silinir; geçmişi olanlar engellenir

#### Müşteri Ekstre ve Ödeme Fişi

- Ekstrede fatura satırına tıklayınca **kalem içeriği** (stok no, ad, adet, fiyat) açılır
- Tek fiş yazdırma veya **birden fazla fiş seçip tek termal fişte** toplu yazdırma
- Tahsilat/Ödeme ekranında **ödeme fişi** yazdırma (kayıttan sonra veya listedeki yazıcı ikonu)

#### Ürün Stok Hareketleri Popup (v1.8.31)

Satış Yap sepetinde **ürün adına tıklayınca** tam ekran popup açılır:

- **Sol panel:** Müşteri arama (her zaman görünür). Yazarak müşteri seçilir; **Tüm müşteriler** ile filtre kaldırılır.
- **Sağ panel:** Seçili ürünün satış / alış / iade hareketleri (tarih, müşteri, fiş no, yön, adet, birim fiyat, satır toplamı).
- Satış ekranında **müşteri seçiliyse** popup açıldığında o müşteri varsayılan filtre olur; yalnızca o müşterinin bu ürünle ilgili hareketleri listelenir.
- Müşteri seçilmeden ürün adına basılırsa **tüm müşterilerin** hareketleri gelir; sol panelden sonradan daraltılabilir.
- API: `GET /api/reports/stock-history?productId=&customerId=` (silinmiş fişler hariç).

#### POST `/api/sales/store` Davranışı

- Tüm üst bilgiler (vade, ödeme, personel, açıklama, ön sipariş) kaydedilir
- **`isPreOrder: true`** → fatura oluşur, **MERKEZ_DEPO stok düşümü yapılmaz**
- Normal satışta stok yetersiz olsa bile satışa izin verilir; **MERKEZ_DEPO bakiyesi eksi değere düşebilir**
- Ön siparişleri görüntüleme: menü **Satış İşlemleri → Ön Siparişler** veya `?page=pre-orders`
- Fatura listesinde **Ön Sipariş** etiketi ile işaretlenir
- Nakit / EFT / Kart → kasa bakiyesi ve tahsilat hareketi TL tutarıyla artar
- Cari → müşteri bakiyesi TL tutarıyla artar

### Stok Yönetimi
- **`MERKEZ_DEPO`** — Satış stoğu (satış düşümü, alış girişi, sağlam iade girişi)
- **`ARIZALI_DEPO`** — Arızalı ürün izolasyon deposu
- Ürün kartlarında **`costPrice` (Alış Maliyeti)** ve **`priceTl` (Satış Fiyatı)** zorunlu takibi
- Stok listesi, barkod etiket ve stok kartı oluşturma ekranları

### Akıllı İade Lojiği (v1.8.8 — müşteri + ürün akışı)

Satış İade ekranında artık **fatura seçimi yok**. Akış:

1. **Müşteri seç** → F2 ile **ürün ara**
2. API (`GET /api/sales/returnable-item`) müşterinin o ürünle ilgili satış geçmişini kontrol eder
3. **Hiç alınmamış** veya **son alım 6 aydan eski** → uyarı popup, sepete eklenmez
4. **Son 6 ay içinde alınmış** → ürün sepete eklenir; **son satış fiyatı ($)** ve yanında **fatura numarası** görünür
5. Fatura numarasına tıklayınca aynı sayfada fatura detayı açılır (Satış Yap düzenleme görünümü, geri ile iade ekranına dönülür)
6. Farklı faturalardan ürünler eklenebilir; kayıtta fatura başına ayrı iade fişi oluşturulur
7. **Çin İade** işareti satır bazında depo yönlendirmesini belirler

### Akıllı İade Lojiği (stok)
- **`isDefective: true`** → iade stoğu **ARIZALI_DEPO**'ya eklenir
- **`isDefective: false`** → iade stoğu **MERKEZ_DEPO** satış stoğuna geri yüklenir
- Müşteri carisinden iade tutarı düşülür, `IADE` tipi fatura oluşturulur

### Müşteri / Cari Yönetimi
- Excel / canlı yedekten aktarılmış **181 müşteri** ve **16.737 ürün**
- Anlık **borç / alacak** takibi, tahsilat / ödeme kayıtları
- Müşteri bakiye raporu ve **costPrice** bazlı **kâr-zarar analizi**
- **Borçlu** ve **alacaklı** müşteriler ayrı tablolarda listelenir (v1.8.22); negatif bakiye = müşteride bizde tutulan alacak

### Fiş Tekrar Yazdırma ve Cari Ayrımı (v1.8.22)

- **Satış faturası düzenleme** ekranında **Fiş Yazdır** butonu — kaydetmeden istediğiniz kadar yazdırabilirsiniz
- Yazdırma çıktısında fatura no, müşteri, tarih ve ödeme bilgisi üst bilgi olarak yer alır
- **Müşteri Borç / Alacak** sayfasında üç özet kart: toplam alacağımız, toplam borcumuz (müşteriye alacaklı), riskli bakiye
- **Borçlu Müşteriler** ve **Alacaklı Müşteriler** ayrı listeler; alacaklılar en yüksek alacaktan sıralı

### Menü ve Müşteri Kartı (v1.8.24)

- **Müşteri Ekstre** ve **Müşteri Borç / Alacak** → **Müşteri İşlemleri** menüsünde
- **Ana Sayfa** altında **Hızlı İşlemler**: Satış Yap, Alış Yap, İade Al, Stok Kartı Oluştur, Faturalar (yeni sekmede)
- Ana sayfa rapor odaklı: son 7 gün satış, en çok satan ürünler, en çok alış yapan müşteriler, düşük stok; hızlı işlem kartları kaldırıldı
- **Geri butonu** aynı sekme içinde çalışır: fatura düzenleme, müşteri kartı, listeye dönüş gibi sayfa içi geçmiş (`history.back`)

### Fatura Düzenleme ve Logo (v1.8.27)

- **Fatura Listesi** ve Ana Sayfa: satış, alış ve iade faturaları düzenlenebilir
- Alış faturaları **Alış Faturası Düzenle** ekranında · iade faturaları **İade Faturası Düzenle** ekranında açılır
- Sol menü logo alanında görünen firma adı: **AKG**

### Müşteri Kartı ve Tıklanabilir İsimler (v1.8.25)

- Her müşteri için **Müşteri Kartı** sayfası (`?page=customer-detail&customerId=…`)
- Kartta: iletişim bilgileri, bakiye, kredi limiti, faturalar, tahsilat/ödemeler, son cari hareketler
- Kısayollar: **Tahsilat/Ödeme**, **Tam Ekstre**, **Düzenle**, satış faturası açma
- Müşteri adı/kodu tıklanabilir: müşteri listesi, borç/alacak, fatura listesi, ana sayfa, stok hareketleri, tahsilat listesi
- **Müşteri Ekstre** ekranında klavye ile arama (↑↓ Enter, liste kaydırmadan müşteri seçimi)

### Cari Bakiye ve Fiş Özeti (v1.8.23)

- **Cari (veresiye)** satışlarda müşteri bakiyesi kayıt sonrası güncellenir; ekrandaki bakiye alanı yenilenir
- Cari seçiliyken sepet doluyken **satış sonrası tahmini bakiye** önizlemesi gösterilir
- Yazdırılan fişin altında **Önceki Bakiye** ve **Satış Sonrası Bakiye** (cari satış veya mevcut bakiyesi olan müşterilerde)
- Düzenleme ekranında **Fiş Yazdır** ile cari faturalarda bakiye özeti de çıkar

### Fatura Listesi ve Ön Sipariş Düzenleme (v1.8.7)

- **Fatura Listesi** ve **Ön Siparişler** ekranlarında satış faturaları için eski popup kaldırıldı
- **Fatura numarasına** veya satırdaki **göz ikonuna** tıklayınca aynı sayfada **Satış Yap** ekranı açılır (yeni sekme yok)
- Müşteri bilgileri, ödeme, teslimat, vade ve **tüm ürün kalemleri** (adet, fiyat $, indirim) API'den dolu gelir
- **DEĞİŞİKLİKLERİ KAYDET** ile tek adımda `PUT /api/sales/invoices/:id` kaydı
- Ön siparişlerde ek olarak **Siparişi Tamamla** (`POST .../fulfill`) butonu görünür
- Düzenlemede **F2 ile yeni ürün eklenebilir** ve satırlar silinebilir (iade kaydı olan satır silinemez)
- Alış ve iade faturaları bu ekrandan düzenlenemez (bilgi mesajı gösterilir)

### Fatura Listesi (genel)

- Satış, alış ve iade faturaları listelenir; düzenleme ve **Fişi Sil** (çöp kutusu) ikonu
- **Fişi Sil:** Fatura kalıcı silinmez — önce **Silinen İşlemler** ekranına taşınır; stok, cari ve kasa etkileri o anda geri alınır
- **Silinen İşlemler:** Buradan **Kalıcı Sil** ile kayıt tamamen kaldırılır (geri alınamaz)
- Bağlı iade kaydı olan satış faturası silinemez (önce iadeler silinmeli)

### Fatura Listesi (detay)
- Tek ekranda **Tümü / Satış / Alış / İade** filtresi
- **Fatura Ara** paneli — müşteri adı/kodu ve ürün (stok kodu, barkod, ad) ile sunucu tarafı arama (v1.7.4)
- Ürün araması geçmiş faturaların kalemlerinde arar; müşteri araması o cariye ait tüm faturaları listeler
- Dashboard kısayolları filtreli listeye yönlendirir
- **Excel İndir / Excel Yükle** ile toplu fatura üst bilgisi güncelleme (v1.7)

### Excel Toplu Aktarım (v1.7.0)

Müşteri carileri, stoklar ve faturalar için **indir → Excel'de düzenle → yükle** akışı eklendi. Bileşen: `frontend/src/components/ExcelActions.tsx` · Backend: `backend/src/utils/excelExchange.ts`

| Ekran | İndir | Yükle | Excel sütunları |
|-------|-------|-------|-----------------|
| **Müşteri Listesi** | Tüm cariler | Yeni ekle / mevcut güncelle | `CariKodu`, `CariAdi`, `YetkiliAdi`, `Adres`, `Ilce`, `Il`, `Email`, `Gsm`, `VergiDairesi`, `VergiTcNo`, `KrediLimiti`, `Bakiye`* |
| **Stok Listesi / Ürün Tanımları** | Tüm ürünler | Yeni ekle / mevcut güncelle (StokKodu ile) | `Id`, `StokKodu`, `StokAdi`, `Kategori`, `Marka`, `Model`, `Gorunum`, `Kalite`, `Renk`, `Aciklama`, `Rmb`, `AlisFiyati`, `SatisFiyati`, `AlisAdedi`, `SatisAdedi`, `Bakiye` |
| **Fatura Listesi** | Faturalar + Kalemler (2 sayfa) | Yalnızca mevcut faturaların üst bilgisi | `FaturaNo`, `Odeme`, `Personel`, `Aciklama`, `Teslimat` |

\* **Bakiye** sütunu dışa aktarımda bilgi amaçlıdır; içe aktarmada **değiştirilmez** (cari bakiye fatura/tahsilat ile hesaplanır).

\* **Kategori** sütunu içe aktarmada yoksa oluşturulur ve ürüne bağlanır (`TAMİR GEREÇLERİ` gibi).

**Stok Excel formatı:** `Bakiye` = MERKEZ_DEPO stok adedi (üzerine yazılır). `AlisAdedi` / `SatisAdedi` yalnızca indirmede bilgi amaçlıdır (yüklemede yok sayılır). Eşleşme `StokKodu` ile yapılır; Excel’de olmayan ürünler silinmez. `Gorunum` → görünüm, `Kalite` → kalite, `Rmb` → RMB fiyatı, `SatisFiyati` → satış ($).

**API uçları:**

| Method | Adres |
|--------|-------|
| GET | `/api/customers/export/excel` |
| POST | `/api/customers/import/excel` (multipart `file`) |
| GET | `/api/products/export/excel` |
| POST | `/api/products/import/excel` |
| GET | `/api/sales/invoices/export/excel?type=` |
| POST | `/api/sales/invoices/import/excel` |

**Kullanım:** İlgili listede sağ üstte **Excel İndir** → dosyayı düzenle → **Excel Yükle**. Sonuç mesajında kaç kayıt eklendi/güncellendi gösterilir; hatalı satırlar özetlenir.

### Mobil Arayüz (v1.3+)
- Hamburger menü, kompakt üst bar, mobil uyumlu padding
- Bildirimler mobilde alt bantta

### Güvenlik Kapısı
- **`akgunteknik` / `123456`** ile korunan admin giriş paneli
- `localStorage` tabanlı oturum kontrolü ve **Router koruması**
- Sol menü altında **Güvenli Çıkış** butonu

---

## Canlı Veri Yedeği (`akgun_canli_data.sql`)

| Konum | Durum |
|-------|-------|
| **Git reposu** | Evet — sürüm kontrolünde (~2.7 MB) |
| **Sunucu dosya sistemi** | Hayır — sunucuya kopyalanmaz |

**Politika:** Veri bir kez çekildikten sonra yedek dosyası yalnızca repoda kalır. Sunucudaki MySQL verisi PVC üzerinde yaşar; SQL dump sunucuda tutulmaz.

**Yerel geliştirme** — Laragon MySQL'e import:

```bash
mysql -u root akgunteknik < akgun_canli_data.sql
```

**K3s kümesine import** — geliştirici makinesinden (kubectl erişimi gerekir):

```bash
bash k8s/import-database.sh
```

Script, repodaki dosyayı `kubectl exec` ile pod'a pipe eder; sunucuya `scp` gerekmez.

---

## Teknoloji Özeti

| Katman | Teknoloji |
|--------|-----------|
| Backend API | Fastify 5, TypeScript, Prisma 7 |
| Veritabanı | MySQL 8.0 (K3s pod veya Laragon) |
| Frontend | React 19, Vite 8, Tailwind CSS v4 |
| HTTP İstemci | Axios |
| İkonlar | Lucide React |
| Container | Docker Hub · K3s rolling update |
| Excel Aktarım | xlsx |

---

## Hızlı Başlangıç

Detaylı kurulum → **[RUN_LOCAL_AND_PROD.md](./RUN_LOCAL_AND_PROD.md)**

```bash
# 1. Laragon'da MySQL'i başlat
# 2. Backend
cd backend && npm install && npx prisma migrate dev && npm run dev

# 3. Frontend (ayrı terminal)
cd frontend && npm install && npm run dev

# 4. Tarayıcı
http://localhost:5173
```

**Giriş:** `akgunteknik` / `123456`

---

## API Öne Çıkan Uçlar

| Method | Adres | Açıklama |
|--------|-------|----------|
| POST | `/api/auth/login` | Admin giriş |
| GET | `/api/sales/dashboard` | Ana sayfa verileri |
| GET | `/api/sales/products?search=&customerId=` | F2 ürün arama |
| POST | `/api/sales/store` | Satış kaydı |
| POST | `/api/sales/return` | İade kaydı |
| GET | `/api/sales/returnable-item?customerId=&productId=` | İade uygunluğu (6 ay, son fiyat) |
| GET | `/api/sales/invoices` | Fatura listesi (tip filtresi) |
| GET | `/api/purchases/init` | Alış ekranı başlangıç verisi |
| POST | `/api/purchases/store` | Alış faturası kaydı |
| POST | `/api/products` | Stok kartı oluştur |
| GET | `/api/products?search=&page=&limit=` | Sayfalı stok listesi |
| GET | `/api/customers?search=&page=&limit=` | Sayfalı müşteri listesi |
| GET | `/api/customers/export/excel` | Tüm carileri Excel indir |
| POST | `/api/customers/import/excel` | Excel'den cari toplu güncelle |
| GET | `/api/products/export/excel` | Tüm stokları Excel indir |
| POST | `/api/products/import/excel` | Excel'den stok toplu güncelle |
| GET | `/api/sales/invoices/export/excel` | Faturaları Excel indir |
| POST | `/api/sales/invoices/import/excel` | Fatura üst bilgisi toplu güncelle |
| GET | `/api/reports/profit` | Kâr-zarar raporu |
| POST | *(script)* `src/utils/importAllData.ts` | İlk kurulum Excel aktarımı (offline) |

---

## Frontend Sayfa Haritası

| Sayfa | Dosya |
|-------|-------|
| Giriş | `frontend/src/pages/Login.tsx` |
| Ana Sayfa | `frontend/src/pages/Dashboard.tsx` |
| Hızlı Satış (F2) | `frontend/src/pages/SalesCreate.tsx` |
| Satış İade | `frontend/src/pages/SalesReturn.tsx` |
| Alış Faturası | `frontend/src/pages/PurchaseCreate.tsx` |
| Stok Listesi | `frontend/src/pages/StockList.tsx` |
| Stok Kartı | `frontend/src/pages/ProductCreate.tsx` |
| Barkod Etiket | `frontend/src/pages/BarcodePrint.tsx` |
| Müşteri Listesi | `frontend/src/pages/CustomerList.tsx` |
| Tahsilat / Ödeme | `frontend/src/pages/CustomerPayment.tsx` — kod/isim arama + **F2** hızlı müşteri paneli |
| Müşteri Bakiye | `frontend/src/pages/CustomerBalances.tsx` |
| Kâr-Zarar Raporu | `frontend/src/pages/ProfitReport.tsx` |
| Fatura Listesi | `frontend/src/pages/Invoices.tsx` |
| Silinen İşlemler | `frontend/src/pages/DeletedInvoices.tsx` |
| Tanımlar | `CategoryManager`, `SafeManager`, `PersonnelManager` |
| Menü tanımları | `frontend/src/lib/navigation.ts` |

---

## Büyük Veri Performans Optimizasyonu

16.000+ ürün ve 180+ müşteri kaydıyla listelerin şişmesini önlemek için **sayfalı (paginated) API** ve **gelişmiş sayfalama paneli** uygulanmıştır.

- `GET /api/products` ve `GET /api/customers` — varsayılan **50** kayıt/sayfa, `totalCount` ile
- Ortak bileşen: `frontend/src/components/PaginationBar.tsx`
- Kullanan ekranlar: `StockList.tsx`, `CustomerList.tsx`

---

## Canlı Dağıtım (Özet)

```bash
# İmaj güncelleme (örnek)
kubectl set image deployment/akgunteknik-frontend frontend=since1907/akgun-frontend:v1.4
kubectl set image deployment/akgunteknik-backend backend=since1907/akgun-backend:v1.2
kubectl rollout status deployment/akgunteknik-frontend --timeout=180s
```

Manifestler: `k8s/apps.yaml`, `k8s/mysql-deployment.yaml` — `kubectl apply -f k8s/`

---

## Geçmiş

Önceki **Laravel + Vue** monolith kod tabanı tamamen temizlendi. Mevcut mimari sıfırdan **Node.js backend + React frontend** üzerine inşa edilmiştir.

| Sürüm | Öne çıkanlar |
|-------|----------------|
| v1.0 | Satış, stok, cari, iade, dashboard |
| v1.1 | Prisma PascalCase düzeltmesi, white-screen fix |
| v1.2 | Alış faturası API + ekranı |
| v1.3 | Mobil UI (hamburger menü) |
| v1.4 | Menü sadeleştirme, tek filtreli fatura listesi |
| v1.5 | Dashboard grafikleri, depo transfer, raporlar, JWT auth, K8s ingress |
| v1.6 | Düzenlenebilir cari/stok/fatura, fatura bazlı iade, F2 kompakt arama |
| v1.7 | Excel indir/yükle — müşteri, stok, fatura toplu güncelleme |
| v1.7.1 | F2 klavye gezinme, ön sipariş listesi, stok hareketi ürün arama, menü yeni sekme, F2 sayfa bağlamı |
| v1.7.2 | F2 arama kutusu yazma/odak düzeltmesi, Esc ve ✕ ile kapanma, fatura listesi arama |
| v1.7.3 | Stok Excel içe aktarımda Kategori otomatik oluşturma, Bakiye sütunu desteği |
| v1.7.4 | Fatura müşteri/ürün arama, Excel 504 timeout düzeltmesi, toplu stok import hızlandırma |
| v1.7.5 | Satış fiyatı TL bazlı kayıt, fatura tarihi/saat düzeltmesi, müşteri seçim doğrulama |
| v1.7.7 | Stok yetersiz olsa bile satışa izin; MERKEZ_DEPO eksi bakiyeye düşebilir |
| v1.7.8 | `/api/version` endpoint, deploy script rollout restart ve sürüm doğrulama |
| v1.7.9 | Tahsilat/Ödeme ekranında müşteri arama ve F2 hızlı müşteri bulma |
| v1.8.0 | Stok hareketi detayları, fatura kalem düzenleme, stok miktarı düzenleme, ön sipariş tamamlama |
| v1.8.1 | Varsayılan işlem para birimi USD; satışta F8 ile maliyet göster/gizle; alış ve iade ekranlarında $ fiyatlandırma |
| v1.8.2 | Sayı alanlarında (adet, fiyat, indirim) tarayıcı yukarı/aşağı okları kaldırıldı |
| v1.8.3 | Fiyatlar virgülden sonra 2 basamak (18,50 $); stoktan gelen tüm fiyatlarda tutarlı yuvarlama |
| v1.8.4 | Nginx/Ingress 600s timeout; Excel ve uzun API isteklerinde 504 düzeltmesi |
| v1.8.5 | Ingress apply kaldırıldı (Rancher uyumu); yalnızca timeout annotation patch |
| v1.8.6 | Kompakt UI — global %30 ölçek (font, buton, boşluk oranları korunarak) |
| v1.8.7 | Fatura/ön sipariş düzenleme — popup kaldırıldı; Satış Yap ekranı ile aynı sayfada tam düzenleme ve tek kaydet |
| v1.8.8 | Satış iade — fatura seçimi kaldırıldı; müşteri+ürün, 6 ay kontrolü, son fiyat ve fatura no ile sepet |
| v1.8.9 | Fatura düzenlemede F2 ile ürün ekleme ve satır silme; stok ve cari otomatik güncellenir |
| v1.8.10 | Ana sayfa Son Faturalar — tıklayınca fatura düzenleme (Satış Yap ekranı, aynı sayfa) |
| v1.8.11 | Satış sepetinde yön tuşları ile İndirim ↔ Adet ↔ Fiyat alanları arası klavye gezinme |
| v1.8.12 | Fatura düzenlemede (ana sayfa / fatura listesi) F2 ile ürün ekleme düzeltmesi |
| v1.8.21 | Satış iade — F2 ile aynı ürün sınırsız ayrı satır; limit/insiyatif kaldırıldı; satır başına Çin iade |
| v1.8.6 | Satış iade API — fatura adet limiti kontrolü kaldırıldı |
| v1.8.20 | Satış iade — fatura iade limiti dolduğunda uyarı + insiyatif ekleme (F2 ve kopyala butonu) |
| v1.8.19 | Satış iade — aynı ürün her F2/ayrı kalem butonu ile yeni satır; satır başına Çin iade tik |
| v1.8.18 | Yazdırma düzeltmesi (menü gizle, sepet temizlemeden önce fiş); migration script sağlamlaştırma |
| v1.8.17 | Satış sepetinde aynı ürün ayrı satır; ön sipariş + yazdır birlikte çalışır |
| v1.8.16 | İade insiyatif ekleme; stok kartı genişletilmiş form; cari ödeme düzenleme |
| v1.8.15 | Ana Sayfa butonu veriyi yeniler; satış iade — aynı ürün birden fazla satır, satır başına Çin iade tik |
| v1.8.14 | UI ölçek %80 (yaklaşık %20 küçültme); tutarlı `btn` / `page-title` / `text-caption` sınıfları; sidebar px yazı boyutları düzeltildi |
| v1.8.13 | Fatura düzenlemede tekrar F2 basınca sayfanın başa dönmesi / sepet sıfırlanması düzeltmesi |
| v1.8.28 | İki aşamalı fiş silme — önce Silinen İşlemler, oradan kalıcı silme; stok/cari geri alma |
| v1.8.30 | F2 son arama hatırlama; maliyet altı satış fiyatında kırmızı satır uyarısı |
| v1.8.31 / API v1.8.10 | Stok hareketi popup; termal fiş (satış/alış/iade/ödeme/ekstre); F2 boş açılış + son arama; menü yeni sekme + geri; cari varsayılan; kasa müşteri değiştirme; ekstre içerik/toplu yazdır; ürün düzenle-sil; Excel yeni şablon; rapor odaklı ana sayfa; hızlı işlemler menüde |
| v1.8.32 / API v1.8.11 | Ana sayfa modern grafikler (trend alan, sıralama barları) ve kartlardan ilgili rapor sayfalarına Tümünü gör |
| v1.8.33 / API v1.8.12 | Ürünlerdeki marka/model metinleri tanım listesine otomatik senkron; stok kartı formunda listeler dolar |
---

## Ingress / Domain (Rancher)

**Önemli:** Canlı ortamda `kubectl apply -f k8s/ingress.yaml` **kullanmayın** — Rancher’daki host/TLS ayarlarının üzerine yazabilir.

- ERP timeout (504): `bash k8s/patch-ingress-timeouts.sh` (host’a dokunmaz)
- **Domain açılmıyor, NodePort çalışıyor:** `bash k8s/fix-production-ingress.sh` (Traefik sınıfına geçirir)
- **DNS Cloudflare’de** (172.67.x / 104.21.x): Origin sunucu `213.238.168.227` olmalı
- Domain yönlendirmesi: **Rancher UI** → Ingress → backend: `akgunteknik-frontend:80`
- Ingress çalışmazsa doğrudan erişim: `kubectl get svc akgunteknik-frontend` → `EXTERNAL-IP:NodePort` (ör. `:30179`)

---

## Diğer Kılavuzlar

- **[REQUIREMENTS.md](./REQUIREMENTS.md)** — Sistem gereksinimleri, paketler, veritabanı şeması
- **[RUN_LOCAL_AND_PROD.md](./RUN_LOCAL_AND_PROD.md)** — Yerel ve production çalıştırma
- **[NEXT_STEPS.md](./NEXT_STEPS.md)** — Sıradaki fazlar ve yapılacaklar
