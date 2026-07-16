#!/bin/bash
# v1.6+ veritabani migration'lari — deploy oncesi calistirilir (idempotent)
set -euo pipefail

DEPLOY="akgunteknik-mysql"
MYSQL_ROOT_PASSWORD="akgunteknik123"
MYSQL_DATABASE="akgunteknik"

echo "==> MySQL pod bekleniyor..."
kubectl rollout status "deployment/${DEPLOY}" --timeout=300s
kubectl wait --for=condition=Ready pod -l "app=${DEPLOY}" --timeout=300s

POD="$(kubectl get pod -l "app=${DEPLOY}" -o jsonpath='{.items[0].metadata.name}')"
echo "==> Migration pod: ${POD}"

mysql_exec() {
  kubectl exec "$POD" -- mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" -e "$1"
}

column_exists() {
  local table="$1"
  local column="$2"
  local count
  count="$(kubectl exec "$POD" -- mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" -N -e \
    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${table}' AND COLUMN_NAME='${column}';")"
  [[ "$count" -gt 0 ]]
}

fk_exists() {
  local name="$1"
  local count
  count="$(kubectl exec "$POD" -- mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" -N -e \
    "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='${MYSQL_DATABASE}' AND CONSTRAINT_NAME='${name}';")"
  [[ "$count" -gt 0 ]]
}

index_exists() {
  local table="$1"
  local index_name="$2"
  local count
  count="$(kubectl exec "$POD" -- mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" -N -e \
    "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${table}' AND INDEX_NAME='${index_name}';")"
  [[ "$count" -gt 0 ]]
}

echo "==> Invoice.originalInvoiceId..."
if ! column_exists "Invoice" "originalInvoiceId"; then
  mysql_exec "ALTER TABLE \`Invoice\` ADD COLUMN \`originalInvoiceId\` INTEGER NULL;"
  echo "    + originalInvoiceId eklendi"
else
  echo "    = zaten var"
fi

echo "==> InvoiceItem.sourceInvoiceItemId..."
if ! column_exists "InvoiceItem" "sourceInvoiceItemId"; then
  mysql_exec "ALTER TABLE \`InvoiceItem\` ADD COLUMN \`sourceInvoiceItemId\` INTEGER NULL;"
  echo "    + sourceInvoiceItemId eklendi"
else
  echo "    = zaten var"
fi

if ! fk_exists "Invoice_originalInvoiceId_fkey"; then
  mysql_exec "ALTER TABLE \`Invoice\` ADD CONSTRAINT \`Invoice_originalInvoiceId_fkey\` FOREIGN KEY (\`originalInvoiceId\`) REFERENCES \`Invoice\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;"
  echo "    + Invoice FK eklendi"
else
  echo "    = Invoice FK zaten var"
fi

if ! fk_exists "InvoiceItem_sourceInvoiceItemId_fkey"; then
  mysql_exec "ALTER TABLE \`InvoiceItem\` ADD CONSTRAINT \`InvoiceItem_sourceInvoiceItemId_fkey\` FOREIGN KEY (\`sourceInvoiceItemId\`) REFERENCES \`InvoiceItem\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;"
  echo "    + InvoiceItem FK eklendi"
else
  echo "    = InvoiceItem FK zaten var"
fi

echo "==> Product detay kolonlari (v1.8.16+)..."
if ! column_exists "Product" "brand"; then
  mysql_exec "ALTER TABLE \`Product\` ADD COLUMN \`brand\` VARCHAR(191) NULL;"
  echo "    + Product.brand eklendi"
else
  echo "    = Product.brand zaten var"
fi
if ! column_exists "Product" "model"; then
  mysql_exec "ALTER TABLE \`Product\` ADD COLUMN \`model\` VARCHAR(191) NULL;"
  echo "    + Product.model eklendi"
else
  echo "    = Product.model zaten var"
fi
if ! column_exists "Product" "appearance"; then
  mysql_exec "ALTER TABLE \`Product\` ADD COLUMN \`appearance\` VARCHAR(191) NULL;"
  echo "    + Product.appearance eklendi"
else
  echo "    = Product.appearance zaten var"
fi
if ! column_exists "Product" "color"; then
  mysql_exec "ALTER TABLE \`Product\` ADD COLUMN \`color\` VARCHAR(191) NULL;"
  echo "    + Product.color eklendi"
else
  echo "    = Product.color zaten var"
fi
if ! column_exists "Product" "quality"; then
  mysql_exec "ALTER TABLE \`Product\` ADD COLUMN \`quality\` VARCHAR(191) NULL;"
  echo "    + Product.quality eklendi"
else
  echo "    = Product.quality zaten var"
fi
if ! column_exists "Product" "rbmPrice"; then
  mysql_exec "ALTER TABLE \`Product\` ADD COLUMN \`rbmPrice\` DOUBLE NOT NULL DEFAULT 0;"
  echo "    + Product.rbmPrice eklendi"
else
  echo "    = Product.rbmPrice zaten var"
fi
if ! column_exists "Product" "description"; then
  mysql_exec "ALTER TABLE \`Product\` ADD COLUMN \`description\` TEXT NULL;"
  echo "    + Product.description eklendi"
else
  echo "    = Product.description zaten var"
fi

echo "==> BrandModel kind kolonu (v1.8.22+)..."
if ! column_exists "BrandModel" "kind"; then
  mysql_exec "ALTER TABLE \`BrandModel\` ADD COLUMN \`kind\` VARCHAR(191) NOT NULL DEFAULT 'MODEL';"
  echo "    + BrandModel.kind eklendi"
else
  echo "    = BrandModel.kind zaten var"
fi
if index_exists "BrandModel" "BrandModel_name_categoryId_key"; then
  mysql_exec "ALTER TABLE \`BrandModel\` DROP INDEX \`BrandModel_name_categoryId_key\`;"
  echo "    + eski BrandModel unique kaldirildi"
fi
if ! index_exists "BrandModel" "BrandModel_name_categoryId_kind_key"; then
  mysql_exec "ALTER TABLE \`BrandModel\` ADD UNIQUE INDEX \`BrandModel_name_categoryId_kind_key\` (\`name\`, \`categoryId\`, \`kind\`);"
  echo "    + BrandModel name+category+kind unique eklendi"
else
  echo "    = BrandModel unique zaten var"
fi

echo "==> Fatura soft delete (v1.8.28+)..."
if ! column_exists "Invoice" "deletedAt"; then
  mysql_exec "ALTER TABLE \`Invoice\` ADD COLUMN \`deletedAt\` DATETIME(3) NULL;"
  echo "    + Invoice.deletedAt eklendi"
else
  echo "    = Invoice.deletedAt zaten var"
fi
if ! column_exists "InvoiceItem" "isChinaReturn"; then
  mysql_exec "ALTER TABLE \`InvoiceItem\` ADD COLUMN \`isChinaReturn\` BOOLEAN NOT NULL DEFAULT false;"
  echo "    + InvoiceItem.isChinaReturn eklendi"
else
  echo "    = InvoiceItem.isChinaReturn zaten var"
fi

echo "==> Migration tamam."
