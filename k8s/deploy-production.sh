#!/bin/bash
# Akgün Teknik ERP — canlı ortam güncelleme (sunucuda çalıştırın)
# Kullanim: bash k8s/deploy-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKEND_IMAGE="${BACKEND_IMAGE:-since1907/akgun-backend:v1.8.18}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-since1907/akgun-frontend:v1.8.45}"

echo "==> Git guncelleme (orhan branch)..."
git fetch origin orhan
git checkout orhan 2>/dev/null || git checkout -b orhan origin/orhan

if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  echo "==> Yerel degisiklikler algilandi — repoya geciliyor (sunucu kopyasi yedeklenmez)..."
  git status --short
  git reset --hard HEAD
fi

git pull origin orhan

echo "==> Schema kontrolu..."
grep -q "model ProductStock" backend/prisma/schema.prisma || {
  echo "HATA: schema.prisma eski. git pull basarisiz olmus olabilir."
  exit 1
}

echo "==> Veritabani migration (v1.6+)..."
bash k8s/apply-migrations.sh

echo "==> K8s manifestleri..."
kubectl apply -f k8s/mysql-deployment.yaml
kubectl apply -f k8s/apps.yaml
if [ -f k8s/patch-ingress-timeouts.sh ]; then
  echo "==> Ingress timeout (mevcut kurallara dokunulmaz)..."
  bash k8s/patch-ingress-timeouts.sh
fi

echo "==> Imaj guncelleme..."
kubectl set image "deployment/akgunteknik-backend" "backend=${BACKEND_IMAGE}"
kubectl set image "deployment/akgunteknik-frontend" "frontend=${FRONTEND_IMAGE}"

kubectl rollout restart "deployment/akgunteknik-backend"
kubectl rollout restart "deployment/akgunteknik-frontend"

echo "==> Rollout izleme..."
kubectl rollout status "deployment/akgunteknik-backend" --timeout=600s
kubectl rollout status "deployment/akgunteknik-frontend" --timeout=300s

echo ""
echo "==> Pod durumu:"
kubectl get pods -l 'app in (akgunteknik-backend, akgunteknik-frontend, akgunteknik-mysql)'

echo ""
echo "==> Frontend adresi:"
kubectl get svc akgunteknik-frontend

echo ""
echo "==> Backend imaj:"
kubectl get deployment akgunteknik-backend -o jsonpath='{.spec.template.spec.containers[0].image}'; echo

echo "==> Frontend imaj:"
kubectl get deployment akgunteknik-frontend -o jsonpath='{.spec.template.spec.containers[0].image}'; echo

echo "==> Calisan backend podlari:"
kubectl get pods -l app=akgunteknik-backend --field-selector=status.phase=Running \
  -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image,READY:.status.containerStatuses[0].ready

BACKEND_POD="$(kubectl get pod -l app=akgunteknik-backend \
  --field-selector=status.phase=Running \
  --sort-by=.metadata.creationTimestamp \
  -o jsonpath='{.items[-1:].metadata.name}' 2>/dev/null || true)"

if [ -n "${BACKEND_POD}" ]; then
  echo "==> API surum (${BACKEND_POD} /api/version):"
  sleep 3
  kubectl exec "${BACKEND_POD}" -- wget -qO- http://127.0.0.1:3000/api/version 2>/dev/null \
    || kubectl exec "${BACKEND_POD}" -- node -e "require('http').get('http://127.0.0.1:3000/api/version',(r)=>{let d='';r.on('data',(c)=>d+=c);r.on('end',()=>process.stdout.write(d))}).on('error',()=>process.exit(1))" 2>/dev/null \
    || echo "version endpoint henuz yanit vermedi — pod: ${BACKEND_POD}"
fi

echo ""
echo "Deploy tamam! Giriş: akgunteknik / 123456"
