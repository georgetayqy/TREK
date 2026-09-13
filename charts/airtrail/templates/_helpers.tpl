{{- define "airtrail.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "airtrail.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "airtrail.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "airtrail.labels" -}}
helm.sh/chart: {{ include "airtrail.chart" . }}
{{ include "airtrail.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "airtrail.selectorLabels" -}}
app.kubernetes.io/name: {{ include "airtrail.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "airtrail.dbFullname" -}}
{{- printf "%s-db" (include "airtrail.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "airtrail.secretName" -}}
{{- if .Values.secret.existingSecret -}}
{{- .Values.secret.existingSecret -}}
{{- else -}}
{{- printf "%s-secret" (include "airtrail.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "airtrail.dbUrl" -}}
{{- if .Values.secret.dbUrl -}}
{{- .Values.secret.dbUrl -}}
{{- else -}}
{{- printf "postgres://%s:%s@%s:5432/%s" .Values.env.dbUsername .Values.secret.dbPassword (include "airtrail.dbFullname" .) .Values.env.dbDatabaseName -}}
{{- end -}}
{{- end -}}
