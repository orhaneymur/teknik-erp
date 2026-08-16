{{/*
Servis/deployment adları TÜM müşterilerde bilerek AYNI tutulur.

Namespace'ler birbirinden yalıtık olduğu için çakışma olmaz; kazancı şudur:
frontend imajındaki nginx.conf "proxy_pass http://teknikerp-backend:3000"
satırı hiç değişmeden her müşteride kendi backend'ine gider. Böylece tek
Docker imajı tüm müşterilere hizmet eder.
*/}}

{{- define "teknikerp.backendName" -}}teknikerp-backend{{- end -}}
{{- define "teknikerp.frontendName" -}}teknikerp-frontend{{- end -}}
{{- define "teknikerp.mysqlName" -}}teknikerp-mysql{{- end -}}
{{- define "teknikerp.secretName" -}}teknikerp-secrets{{- end -}}
{{- define "teknikerp.configName" -}}teknikerp-config{{- end -}}
{{- define "teknikerp.database" -}}teknikerp{{- end -}}

{{/*
Müşterinin alan adı.
ingress.host acikca verilmisse o kullanilir; yoksa <id><suffix>.<base>
kalibindan uretilir  ->  demo + "-erp" + "derneklab.com" = demo-erp.derneklab.com
*/}}
{{- define "teknikerp.host" -}}
{{- if .Values.ingress.host -}}
{{- .Values.ingress.host -}}
{{- else -}}
{{- printf "%s%s.%s" (required "tenant.id zorunludur (--set tenant.id=demo)" .Values.tenant.id) (.Values.domain.tenantSuffix | default "") .Values.domain.base -}}
{{- end -}}
{{- end -}}

{{- define "teknikerp.backendImage" -}}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.backend .Values.image.tag -}}
{{- end -}}

{{- define "teknikerp.frontendImage" -}}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.frontend .Values.image.tag -}}
{{- end -}}

{{/* Her kaynağa basılan ortak etiketler — kubectl ile müşteri filtrelemeyi sağlar */}}
{{- define "teknikerp.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: teknikerp
teknikerp.io/tenant: {{ .Values.tenant.id | quote }}
{{- end -}}
