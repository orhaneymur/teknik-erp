# TeknikERP — SaaS Kurulum ve İşletme Kılavuzu

Bu belge, tek müşteriye özel çalışan Akgün Teknik ERP'nin **çok müşterili
(SaaS) TeknikERP**'ye nasıl dönüştüğünü ve günlük işletmesinin nasıl
yapılacağını anlatır.

---

## 1. Mimari — nasıl çalışıyor?

Her müşteri (tenant) k3s içinde **kendi namespace'ini** alır. Namespace'ler
birbirinden yalıtıktır: ayrı veritabanı, ayrı disk, ayrı şifreler.

```
*.teknikerp.com  →  sunucu IP  →  nginx-ingress
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
 akgunteknik.teknikerp.com       demo.teknikerp.com          xyzoto.teknikerp.com
 ns: tenant-akgunteknik          ns: tenant-demo             ns: tenant-xyzoto
   teknikerp-frontend              teknikerp-frontend          teknikerp-frontend
   teknikerp-backend               teknikerp-backend           teknikerp-backend
   teknikerp-mysql (+PVC)          teknikerp-mysql (+PVC)      teknikerp-mysql (+PVC)
```

### Neden servis adları her müşteride aynı?

`teknikerp-backend`, `teknikerp-mysql` adları bilerek sabittir. Namespace'ler
yalıtık olduğu için çakışmazlar. Kazancı büyüktür: frontend imajının içindeki
`nginx.conf` dosyasında yazan

```nginx
proxy_pass http://teknikerp-backend:3000/api/;
```

satırı hiç değişmeden her müşteride **kendi** backend'ine gider. Böylece
**tek bir Docker imajı tüm müşterilere hizmet eder.**

### Müşteriye özel olan tek şey: ConfigMap + Secret

| Nereden gelir | Ne içerir |
|---|---|
| **ConfigMap** (`teknikerp-config`) | Firma adı, sekme başlığı, iletişim satırı, para birimi |
| **Secret** (`teknikerp-secrets`) | MySQL şifresi, `DATABASE_URL`, JWT secret, yönetici şifresi |

Firma adı **build sırasında değil, çalışma anında** okunur: tarayıcı açılışta
`/config.json` dosyasını çeker (`frontend/src/lib/tenantConfig.ts`). Bu dosya
nginx'e ConfigMap'ten mount edilir.

> **Sonuç: yeni müşteri açmak için imaj derlemek gerekmez.** Kurulum ~2 dakika.

---

## 2. Hedef sunucunun durumu (2026-08-17 itibarıyla)

Kurulum `dev.prod.com` / **213.238.168.227** üzerinde yapılacak.

| Konu | Durum |
|---|---|
| k3s | ✅ v1.35.4+k3s1, tek düğüm (control-plane) |
| Helm | ✅ v3.21.0 kurulu |
| StorageClass | ✅ `local-path` (varsayılan) |
| metrics-server | ✅ kurulu — `kubectl top` çalışır |
| Ingress | ⚠️ Hem traefik hem nginx kurulu, ama **80/443'ü traefik tutuyor** |
| cert-manager | ❌ kurulu değil — şimdilik HTTPS yok |
| RAM | ⚠️ 7.8 Gi'nin 6.1 Gi'i dolu, **~1.7 Gi boş** |
| Disk | ✅ 79 G'nin 35 G'i boş |

### Neden traefik?

Kümede `ingress-nginx` kurulu ama `svclb-ingress-nginx-controller` pod'u
**Pending** durumda: 80/443 portlarını traefik'in servisi tutuyor, nginx
alamıyor. Çalışan bütün Ingress'ler (Rancher, `akgun.derneklab.com`,
`test2/test3.derneklab.com`) traefik kullanıyor.

Bu yüzden chart varsayılanı `ingress.className: traefik`. nginx'e geçmek
istersen önce port çakışmasını çözmek gerekir.

### Ön koşul: DNS (her yeni müşteride bir kayıt)

`derneklab.com` **Cloudflare** üzerinden yönetiliyor — `akgun.derneklab.com`
ve `test3.derneklab.com` Cloudflare IP'lerine (104.21.26.247 / 172.67.139.174)
çözümleniyor, oradan origin sunucuya (213.238.168.227) gidiyor.

**Wildcard kaydı yok.** Her müşteri için Cloudflare'de bir kayıt açılmalı:

| Alan | Değer |
|---|---|
| Type | `A` |
| Name | `demo-erp` |
| IPv4 | `213.238.168.227` |
| Proxy | **Proxied** (turuncu bulut) — mevcut kayıtlarla aynı |

Müşteri adresleri `<ad>-erp.derneklab.com` kalıbında: `demo-erp`,
`akgunteknik-erp`, `xyzoto-erp`. Chart bunu `domain.tenantSuffix` ile üretir.

### HTTPS — Cloudflare hallediyor

Kayıtlar **proxied** olduğu için TLS'i Cloudflare sonlandırıyor; kullanıcı
HTTPS görür, Cloudflare origin'e HTTP ile gider. Bu yüzden kümede
cert-manager'a gerek yok ve `ingress.tls.enabled` **kapalı** kalır —
mevcut uygulamalar da tam olarak böyle çalışıyor.

> ⚠️ Cloudflare ücretsiz planında istek zaman aşımı **100 saniye**
> (hata 524) ve yükleme sınırı **100 MB**'dır. Çok büyük Excel içe
> aktarımları bu sınıra takılabilir — origin'de değil Cloudflare'de.

---

## 3. İmajları derle ve gönder

```bash
bash k8s/build-images.sh v1.9.0
```

Bu iki imajı üretir ve Docker Hub'a gönderir:
- `since1907/teknikerp-backend:v1.9.0`
- `since1907/teknikerp-frontend:v1.9.0`

---

## 4. Yeni müşteri aç

```bash
bash k8s/new-tenant.sh xyzoto "XYZ Oto Elektrik"
```

Script sırasıyla: `tenant-xyzoto` namespace'ini oluşturur → rastgele şifreler
üretip Secret'a yazar → MySQL, backend, frontend, Ingress ve gecelik yedek
işini kurar → şema migration'ını çalıştırır → giriş bilgilerini ekrana yazar.

**Sık kullanılan ek ayarlar:**

```bash
# Demo ortamı — her gece sıfırlanır
bash k8s/new-tenant.sh demo "TeknikERP Demo" --set demoReset.enabled=true

# Yoğun müşteri — 2 backend kopyası, daha büyük disk
bash k8s/new-tenant.sh akgunteknik "Akgün Teknik" \
  --set backend.replicas=2 --set mysql.storage=10Gi

# HTTPS olmadan (cert-manager kurulu değilse)
bash k8s/new-tenant.sh test "Test Firma" --set ingress.tls.enabled=false
```

Yönetici şifresini sonradan okumak için:

```bash
kubectl get secret teknikerp-secrets -n tenant-xyzoto \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

---

## 5. Güncelleme

```bash
# Önce demo — kontrol et
bash k8s/update-all-tenants.sh v1.9.1 demo

# Sorun yoksa tüm müşteriler
bash k8s/update-all-tenants.sh v1.9.1
```

`--reuse-values` sayesinde müşteriye özel ayarlar (firma adı, replica sayısı,
disk boyutu) korunur; yalnızca sürüm değişir.

**Bir müşteride sorun çıkarsa yalnızca o müşteri geri alınır:**

```bash
helm rollback teknikerp -n tenant-xyzoto
```

**Hangi müşteride hangi sürüm çalışıyor:**

```bash
helm list -A -f teknikerp
```

---

## 6. Yedekleme

Her müşteride gece 03:00'te `mysqldump` çalışır, yedek o müşterinin yedek
diskine `.sql.gz` olarak yazılır ve 14 günden eskiler silinir.

```bash
# Yedekleri listele
kubectl exec -n tenant-xyzoto deploy/teknikerp-mysql -- ls -lh /backups 2>/dev/null || \
kubectl get cronjob -n tenant-xyzoto

# Elle yedek al
kubectl create job --from=cronjob/teknikerp-backup manuel-yedek -n tenant-xyzoto
```

> ⚠️ **Yedekler kümenin kendi diskinde durur.** Sunucu diskini kaybedersen
> yedekler de gider. Üretime geçmeden önce bu yedekleri küme dışına
> (S3 / Hetzner Storage Box / harici disk) kopyalayan bir iş kur.

---

## 7. Demo ortamının sıfırlanması

Demo her gece 04:00'te "altın kopya"ya döner. Altın kopyayı bir kez sen
oluşturursun — demoyu istediğin örnek veriyle doldurduktan sonra:

```bash
kubectl exec -n tenant-demo deploy/teknikerp-mysql -- sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction teknikerp | gzip' \
  > demo-golden.sql.gz
# Ardından bu dosyayı tenant-demo yedek diskine /backups/demo-golden.sql.gz olarak koy.
```

Dosya yoksa sıfırlama işi **hata vermez**, uyarı basıp çıkar — yanlışlıkla
veri silinmesin diye.

---

## 8. Müşteriyi durdurma / silme

```bash
# Ödeme gelmedi — durdur (veri diskte kalır, saniyeler içinde geri açılır)
kubectl scale deployment --all --replicas=0 -n tenant-xyzoto

# Geri aç
helm upgrade teknikerp charts/teknikerp -n tenant-xyzoto --reuse-values

# Tamamen sil — DİKKAT: uygulamayı kaldırır ama veri diskini KORUR
helm uninstall teknikerp -n tenant-xyzoto

# Veriyi de gerçekten sil (geri dönüşü YOK — önce yedek al!)
kubectl delete namespace tenant-xyzoto
```

Disk (`PVC`) ve Secret'ta `helm.sh/resource-policy: keep` işareti vardır:
`helm uninstall` müşteri verisini silmez. Bu kasıtlıdır.

---

## 9. Kapasite — dikkat

Müşteri başına kaynak isteği: MySQL 512 Mi + backend 64 Mi + frontend 16 Mi
≈ **600 Mi RAM** (hafif profille ~340 Mi).

**Ama `dev.prod.com` boş bir sunucu değil.** 7.8 Gi RAM'in 6.1 Gi'i zaten
dolu; üzerinde Rancher yığını, Akgün Teknik canlısı, `dernek-app`,
`dernek-admin` ve üç ayrı tenant (`lafed`, `test2`, `test3`) çalışıyor —
toplam **6 ayrı MySQL**. Swap da kullanımda (285 Mi), yani sistem şimdiden
baskı altında.

| Gerçek | Sonuç |
|---|---|
| ~1.7 Gi boş RAM | Hafif profille **1, zorlarsak 2** TeknikERP müşterisi sığar |
| Kubernetes "%37 dolu" diyor | Yanıltıcı — pod'ların çoğunun istek (request) değeri gerçek kullanımın altında |

Yani bu sunucu **demo ve test için uygun, gerçek SaaS büyümesi için değil.**
Müşteri almaya başlayınca üç seçenek var:

1. RAM yükselt (8 → 16/32 GB) — en basiti
2. TeknikERP için ayrı bir sunucu — canlıyı Rancher/dernek yükünden ayırır
3. Bu sunucuda yer aç (aşağıya bak)

### Yer açma adayları

```bash
# default namespace'inde ne ise yaradigi belirsiz iki uygulama var
kubectl get deploy html-site-deployment mysql-deployment -n default
kubectl logs deploy/mysql-deployment -n default --tail=20

# Akgun Teknik 2+2 replika ile calisiyor; tek dukkan icin 1+1 yeterli olabilir
kubectl scale deploy/akgunteknik-backend --replicas=1 -n default
kubectl scale deploy/akgunteknik-frontend --replicas=1 -n default

# 63 gundur "Terminating" durumunda takili kalmis disk
kubectl get pvc akgun-mysql-pvc -n default
```

---

## 10. Sorun giderme

```bash
# Genel durum
kubectl get pods -n tenant-xyzoto

# Şema kurulmadıysa — migration job'unun günlüğü
kubectl logs -n tenant-xyzoto job/teknikerp-migrate

# Backend açılmıyorsa (JWT_SECRET / ADMIN_PASSWORD eksikse burada yazar)
kubectl logs -n tenant-xyzoto deploy/teknikerp-backend

# Sağlık kontrolü
kubectl exec -n tenant-xyzoto deploy/teknikerp-backend -- \
  wget -qO- http://127.0.0.1:3000/api/health
```

| Belirti | Olası sebep |
|---|---|
| Backend pod `CrashLoopBackOff`, günlükte "JWT_SECRET tanımlı değil" | Secret oluşmamış — `helm upgrade` tekrarla |
| Arayüz açılıyor, veri gelmiyor (502) | `teknikerp-backend` servisi yok ya da backend Ready değil |
| Firma adı yanlış görünüyor | ConfigMap değişti ama pod yeniden başlamadı — `kubectl rollout restart deploy/teknikerp-frontend -n <ns>` |
| Sertifika alınamadı | DNS wildcard kaydı yok veya cert-manager `ClusterIssuer` eksik |

---

## 11. Eski kurulumdan geçiş (Akgün Teknik)

Akgün Teknik şu an `default` namespace'inde `akgunteknik-*` adlarıyla çalışır.
Taşıma **kesinti gerektirir** — dükkân kapalıyken yapılmalı.

1. Yedek al:
   ```bash
   kubectl exec deploy/akgunteknik-mysql -- sh -c \
     'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction akgunteknik | gzip' \
     > akgun-tasima.sql.gz
   ```
2. Yeni müşteriyi kur:
   ```bash
   bash k8s/new-tenant.sh akgunteknik "Akgün Teknik" --set backend.replicas=2
   ```
3. Veriyi geri yükle:
   ```bash
   gunzip -c akgun-tasima.sql.gz | kubectl exec -i -n tenant-akgunteknik \
     deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp'
   ```
4. Alan adını yeni Ingress'e yönlendir, test et.
5. **Eski kurulumu en az bir hafta silme.** Sorun çıkarsa geri dönüş yolu odur.

> Eski `default` namespace'indeki kurulum için `k8s/apps.yaml` içine
> `teknikerp-backend` adında bir geçiş servisi eklendi. Yeni frontend imajı
> bu ad üzerinden konuştuğu için eski kurulum da çalışmaya devam eder.
> Taşıma bittikten sonra bu servis silinebilir.
