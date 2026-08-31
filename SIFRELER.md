# Şifreler — okuma ve değiştirme

Bu belgede **hiçbir gerçek şifre yazmaz.** Yalnızca nereden okunacağı ve
nasıl değiştirileceği anlatılır.

---

## 1. Kaç çeşit şifre var

Sistemde iki ayrı giriş yolu ve dört ayrı sır vardır.

### Giriş yolları

| Kim | Nerede tutulur | Kullanıcı adı |
|---|---|---|
| **Yönetici** (`admin`) | Kubernetes Secret | `admin` |
| **Personel** | Veritabanı, `User` tablosu | e-posta ya da ad |

Yönetici hesabı veritabanından bağımsızdır: veritabanı boş olsa bile
sisteme girebilirsin. Personel hesapları uygulamanın içinden yönetilir.

### Kubernetes Secret içindeki dört değer

Her müşterinin kendi `teknikerp-secrets` kaydı vardır ve içinde:

| Anahtar | Ne işe yarar |
|---|---|
| `admin-password` | Yönetici girişi |
| `mysql-root-password` | Veritabanı root şifresi |
| `database-url` | Bağlantı dizesi (içinde veritabanı şifresi geçer) |
| `jwt-secret` | Oturum jetonlarını imzalar |

Bunlar müşteri başına **farklıdır** ve kurulumda rastgele üretilir.
Aynı şifrenin iki müşteride kullanılması istenmez: birinin jetonu
diğerinde geçerli olmamalıdır.

---

## 2. Şifreyi okuma

### Yönetici şifresi

```bash
kubectl get secret teknikerp-secrets -n tenant-shenzhen \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

Sunucuya bağlanmadan, kendi bilgisayarından:

```bash
ssh -p 23422 root@213.238.168.227 "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; kubectl get secret teknikerp-secrets -n tenant-shenzhen -o jsonpath='{.data.admin-password}' | base64 -d; echo"
```

Namespace'i değiştirerek diğer müşterilere bakılır:

| Müşteri | Namespace |
|---|---|
| Shenzhen Market (canlı) | `tenant-shenzhen` |
| Shenzhen Market (prova) | `tenant-shenzhen-test` |
| TeknikERP Demo | `tenant-demo` |

### Diğer üç değer

Aynı komutta anahtar adını değiştir:

```bash
# veritabani root sifresi
kubectl get secret teknikerp-secrets -n tenant-shenzhen \
  -o jsonpath='{.data.mysql-root-password}' | base64 -d; echo

# baglanti dizesi
kubectl get secret teknikerp-secrets -n tenant-shenzhen \
  -o jsonpath='{.data.database-url}' | base64 -d; echo
```

### `base64 -d` niye gerekiyor

Kubernetes, Secret içindeki değerleri **base64** ile kodlanmış tutar. Bu
şifreleme değildir, sadece kodlamadır — özel karakterler bozulmasın diye.
`base64 -d` onu okunur hâle getirir. Sondaki `echo` satır sonu ekler,
yoksa şifre komut satırına yapışık çıkar.

---

## 3. Yönetici şifresini değiştirme

Repoda hazır script var:

```bash
cd /root/teknikerp
bash k8s/set-admin-password.sh tenant-shenzhen
```

Script şifreyi **iki kez sorar ve ekranda göstermez**. En az 8 karakter
ister. Sonra Secret'i günceller ve backend'i yeniden başlatır (şifre
açılışta okunduğu için yeniden başlatma şart).

### Neden `helm upgrade --set` kullanılmıyor

O yöntemde şifre Helm'in kendi kayıtlarına işlenir ve
`helm get values` çalıştırabilen herkes tarafından görülebilir.
Script yalnızca Kubernetes Secret'ini günceller.

### Değişiklik `helm upgrade` sonrasında kaybolur mu

Hayır. Chart mevcut Secret'i okuyup koruyacak şekilde yazılmış, bu yüzden
sürüm güncellemeleri şifreyi sıfırlamaz.

---

## 4. Personel şifrelerini değiştirme

Bu iş **uygulamanın içinden** yapılır, komut satırına gerek yok:

```
Sol menü → Tanımlar → Personel Tanımları
```

- Yeni personel eklerken şifre **zorunludur**
- Mevcut personeli düzenlerken şifre alanı **boş bırakılırsa değişmez**

Personel hesapları veritabanında durur; müşteri taşındığında veriyle
birlikte taşınır.

---

## 5. Veritabanı ve JWT şifreleri

Bunlara **normal şartlarda dokunulmaz.**

- `mysql-root-password` değiştirilirse `database-url` de aynı anda
  güncellenmeli, yoksa uygulama veritabanına bağlanamaz.
- `jwt-secret` değiştirilirse o an açık olan tüm oturumlar düşer;
  herkes yeniden giriş yapar. Güvenlik şüphesi varsa bu istenen sonuçtur.

Gerekirse ikisi birlikte, bakım saatinde ve yedek alındıktan sonra
değiştirilmelidir.

---

## 6. Kurulumda üretilen şifreyi kaçırdım

Yeni müşteri açıldığında script şifreyi ekrana bir kez yazar. Kaçırırsan
yukarıdaki okuma komutuyla her zaman tekrar bakabilirsin — şifre Secret'te
durmaya devam eder.

---

## 7. Dikkat

- Şifreyi komut satırına **parametre olarak yazma**: kabuk geçmişine
  (`~/.bash_history`) düşer. `set-admin-password.sh` bu yüzden soru sorar.
- Okuma komutlarının çıktısı ekranda görünür; başkası ekranını
  görüyorsa dikkat et.
- Bu belgeye gerçek şifre **eklenmemelidir**. Repo geçmişi silinmez.
