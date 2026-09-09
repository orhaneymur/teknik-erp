# TeknikERP — oturum başlangıcı

**Her oturumun ilk işi: [DURUM.md](./DURUM.md) dosyasını oku ve kullanıcıya
nerede kaldığımızı özetle.** Orada ne çalışıyor, ne bekliyor, sıradaki adım
ne — hepsi yazılı. Kullanıcı "nerede kaldık?" demeden söyle.

---

## Proje

Türkçe konuşulan bir projedir. Kod yorumları, commit mesajları, belgeler ve
kullanıcıyla iletişim **Türkçe**dir.

İki ayrı ürün, iki ayrı depo, iki ayrı sürüm:

| | ERP | Fiyat listesi |
|---|---|---|
| Depo | `orhaneymur/teknik-erp` (bu klasör) | `orhaneymur/liste-erp` (`~/Desktop/Fiyat Liste`) |
| İmaj | `since1907/teknikerp-backend` + `-frontend` | `since1907/teknikfiyat` |
| Helm | `teknikerp` | `teknikfiyat` |

Aynı namespace'te yaşarlar ama birbirinden bağımsızdır. Aralarındaki tek bağ
`GET /api/public/fiyat-listesi` ucudur.

---

## Çalışma kuralları

**Doğrula, tahmin etme.** Bir davranış hakkında konuşmadan önce kodu oku.
"Muhtemelen şöyledir" deme; `grep` ile bak, gerekiyorsa yerelde çalıştır.

**Canlıya gitmeden önce yerelde dene.** Para veya stok hesabına dokunan bir
değişiklik yaptıysan yerel MySQL kabı kurup gerçek senaryoyu çalıştır:

```bash
docker run -d --name erp-test-mysql -e MYSQL_ROOT_PASSWORD=test \
  -e MYSQL_DATABASE=teknikerp -p 3399:3306 mysql:8.0
cd backend && export DATABASE_URL="mysql://root:test@127.0.0.1:3399/teknikerp"
npx prisma db push --url "$DATABASE_URL" --accept-data-loss
npx tsx prisma/<test-dosyasi>.ts
```

`mysql:8.0` kullan (8.4 bazı bayrakları reddediyor), `localhost` değil
`127.0.0.1` yaz (localhost IPv6'ya çözülüyor).

**Sunucu komutları TEK SATIR olmalı.** Bu projenin sunucusuna açılan SSH
oturumlarında çok satırlı yapıştırma kırpılıyor; 10 Eylül 2026'da iki kez
oldu ve ikincisinde yarım çalışan bir `DELETE` bloğu veri kaybına yaklaştı.
Heredoc kullanma, backtick kullanma. Kalıp:

```bash
kubectl exec -n tenant-shenzhen deploy/teknikerp-mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" teknikerp -t -e "SELECT ..."'
```

Dış tırnak tek, iç tırnak çift, tablo adlarında backtick yok
(`Transaction` MySQL'de ayrılmış kelime değil, tırnaksız çalışır).

**Tehlikeli yetenekleri koda koyma.** Proje kararı (10 Eylül 2026): canlı
veriyi silebilecek bir yol uygulamada bulunmasın — kodda var olan yetenek er
ya da geç kullanılır. `provaSifirla.ts` betiğindeki `IZINLI_ORTAMLAR` beyaz
listesine **`shenzhen` asla eklenmez** ve betiğe canlı için istisna yolu
yazılmaz. Canlı sıfırlama gerekirse sunucudan elle SQL ile yapılır.

**Önce prova, sonra canlı.** `shenzhen-test` → `shenzhen`. İkisinin sürümü
ayrışmışsa bir sonraki sürümde eşitle.

**Sürüm çıkarırken hangi maddenin kimin isteğiyle geldiğini söyle.** Bir dönem
sürümler dağıtılabildiğinden hızlı çıktı ve "bunu ne zaman istedim?" sorusu
geldi. Kısa bir tabloyla ilet.

---

## Belgeler

| Dosya | Ne için |
|---|---|
| `DURUM.md` | **Nerede kaldık, sırada ne var** — her oturum önce bu |
| `SAAS.md` | Mimari, çok müşterili yapı, yeni müşteri açma |
| `SIFRELER.md` | Şifreleri okuma ve değiştirme yordamı (literal şifre yok) |
| `docs/kullanim-kilavuzu.html` | Müşteriye verilen kılavuz |
| `docs/isletme-notlari.html` | Dahili notlar — **gitignore'da, depo public olduğu için** |
| `NEXT_STEPS.md` | Güncelliğini yitirmiş, terk edilmiş depodan bahsediyor |
