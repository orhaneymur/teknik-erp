#!/bin/bash
# TeknikERP — sunucu durum raporu.
#
# SADECE OKUR. Hicbir sey degistirmez, silmez, kurmaz. Guvenle calistirabilirsin.
#
# Kullanim (sunucuda):
#   bash k8s/server-check.sh
#
# Ya da kendi bilgisayarindan tek satirda:
#   ssh <kullanici>@<sunucu-ip> 'bash -s' < k8s/server-check.sh
#
# Ciktinin TAMAMINI kopyalayip yapistir.

# Not: set -e KULLANILMIYOR — bir komut yoksa rapor durmasin, devam etsin.

line() { printf '\n%s\n' "======================================================================"; }
title() { line; echo " $1"; line; }

# kubectl bazen root disi kullanicida yapilandirilmamis olur; k3s'in kendi
# kubeconfig'ini deneriz.
KUBECTL="kubectl"
if ! $KUBECTL get nodes >/dev/null 2>&1; then
  if [ -r /etc/rancher/k3s/k3s.yaml ]; then
    export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  elif sudo -n true 2>/dev/null && sudo test -r /etc/rancher/k3s/k3s.yaml; then
    KUBECTL="sudo kubectl"
  fi
fi

title "1. SUNUCU KIMLIGI"
echo "Tarih      : $(date)"
echo "Makine adi : $(hostname)"
echo "Calisma sur: $(uptime -p 2>/dev/null || uptime)"
if [ -r /etc/os-release ]; then
  . /etc/os-release
  echo "Isletim sis: ${PRETTY_NAME}"
fi
echo "Cekirdek   : $(uname -r)"
echo "Mimari     : $(uname -m)"

title "2. ISLEMCI (CPU)"
echo "Cekirdek sayisi: $(nproc)"
grep -m1 'model name' /proc/cpuinfo 2>/dev/null | sed 's/^/Model          : /'
echo ""
echo "Anlik yuk (1/5/15 dk ortalamasi — cekirdek sayisini asarsa sunucu zorlaniyor):"
cat /proc/loadavg 2>/dev/null | awk '{print "  " $1 "  " $2 "  " $3}'

title "3. BELLEK (RAM)  <-- KAC MUSTERI SIGACAGINI BU BELIRLER"
free -h 2>/dev/null || echo "free komutu yok"
echo ""
echo "Yorum: 'available' sutunu su an gercekten bos olan bellektir."
echo "       Musteri basina ~600 Mi gerekir."

title "4. DISK"
df -h -x tmpfs -x devtmpfs 2>/dev/null
echo ""
echo "k3s veri dizini (kalici diskler burada durur):"
du -sh /var/lib/rancher 2>/dev/null || sudo du -sh /var/lib/rancher 2>/dev/null || echo "  okunamadi (yetki gerekebilir)"

title "5. K3S / KUBERNETES DURUMU"
if ! $KUBECTL version --client >/dev/null 2>&1; then
  echo "kubectl BULUNAMADI — bu sunucuda k3s kurulu olmayabilir."
else
  $KUBECTL version 2>/dev/null | head -5
  echo ""
  echo "-- Dugumler (nodes) --"
  $KUBECTL get nodes -o wide 2>&1
fi

title "6. DUGUM KAPASITESI VE AYRILMIS KAYNAKLAR"
echo "Onemli: 'Requests' sutunu SOZ VERILEN kaynaktir. %100'e yaklastiysa"
echo "yeni musteri pod'lari 'Pending' durumunda bekler — bos RAM olsa bile."
echo ""
for node in $($KUBECTL get nodes -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
  echo "--- ${node} ---"
  $KUBECTL describe node "$node" 2>/dev/null | sed -n '/Allocatable:/,/^Events\|^Non-terminated/p' | head -20
  echo ""
  $KUBECTL describe node "$node" 2>/dev/null | sed -n '/Allocated resources:/,/^Events/p' | head -15
  echo ""
done

title "7. ANLIK KULLANIM (metrics-server gerekir)"
$KUBECTL top nodes 2>&1 | head -10
echo ""
$KUBECTL top pods -A 2>&1 | head -25

title "8. CALISAN HER SEY (tum namespace'ler)"
$KUBECTL get pods -A -o wide 2>&1

title "9. NAMESPACE'LER"
$KUBECTL get namespaces 2>&1

title "10. KALICI DISKLER (PVC) VE DEPOLAMA SINIFI"
$KUBECTL get pvc -A 2>&1
echo ""
echo "-- StorageClass (yeni musteri diskleri bununla acilir) --"
$KUBECTL get storageclass 2>&1

title "11. DIS ERISIM: INGRESS CONTROLLER"
echo "TeknikERP chart'i 'nginx' bekliyor. Asagida traefik gorursen"
echo "ya nginx-ingress kurmaliyiz ya da chart'i traefik'e ayarlamaliyiz."
echo ""
$KUBECTL get ingressclass 2>&1
echo ""
echo "-- Ingress controller pod'lari --"
$KUBECTL get pods -A 2>/dev/null | grep -Ei 'ingress|traefik' || echo "  bulunamadi"
echo ""
echo "-- Mevcut ingress kurallari (hangi alan adlari kullaniliyor) --"
$KUBECTL get ingress -A 2>&1

title "12. HTTPS: CERT-MANAGER"
$KUBECTL get pods -n cert-manager 2>&1 | head -5
echo ""
echo "-- ClusterIssuer (Let's Encrypt yapilandirmasi) --"
$KUBECTL get clusterissuer 2>&1

title "13. HELM"
if command -v helm >/dev/null 2>&1; then
  helm version --short 2>&1
  echo ""
  echo "-- Kurulu helm uygulamalari --"
  helm list -A 2>&1
else
  echo "helm KURULU DEGIL — kurmamiz gerekecek (tek komut, kolay)."
fi

title "14. DIS IP ADRESI"
curl -s --max-time 5 https://ifconfig.me 2>/dev/null || \
  curl -s --max-time 5 https://api.ipify.org 2>/dev/null || \
  echo "ogrenilemedi (internet cikisi kisitli olabilir)"
echo ""
echo "DNS'te su kayit gerekecek:  *.teknikerp.derneklab.com  ->  yukaridaki IP"

title "RAPOR SONU"
echo "Bu ciktinin TAMAMINI kopyalayip Claude'a yapistir."
