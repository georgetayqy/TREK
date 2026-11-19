# AirTrail Helm Chart

Deploys [AirTrail](https://github.com/johly/airtrail) on Kubernetes, with its
PostgreSQL database managed by the [CloudNativePG](https://cloudnative-pg.io)
operator. Originally converted from the upstream `docker-compose.yml`.

## Requirements

- The **CloudNativePG operator** must be installed (and its CRDs present)
  before this chart, because the chart creates a `postgresql.cnpg.io/v1`
  `Cluster`. On the Talos cluster it is deployed by Argo CD from
  `personal-cluster/services/cloud-native-postgres-operator`.
- The **Sealed Secrets** controller, because `airtrail-secret` ships as a
  `SealedSecret`.
- An ingress controller matching `airtrail.ingress.className` (Traefik on the
  Talos cluster).

## What it creates

- `Cluster` (CloudNativePG) named `<release>-db`: one Postgres instance with
  the `airtrail` database and owner created from `env.dbDatabaseName` /
  `env.dbUsername`. The operator generates the password and the connection
  details in the `<release>-db-app` secret.
- `Deployment` + `Service` + `PersistentVolumeClaim` (uploads) for AirTrail.
  `DB_URL` is taken from the `uri` key of `<release>-db-app`, which overrides
  any `DB_URL` in `airtrail-secret`.
- `SealedSecret` `airtrail-secret` with the app settings (`ORIGIN`,
  `BODY_SIZE_LIMIT`, OAuth settings, ...). See [Secrets](#secrets).
- Optional `Ingress`.

### Readiness

The AirTrail container has a readiness probe that opens a TCP connection to the
database's read-write Service (`<release>-db-rw:5432`) using `node`. CNPG's
`-rw` Service has no endpoints until a primary is elected, so the pod is only
Ready while a primary is reachable. It does not delay startup: on a fresh
install AirTrail may restart a few times until the database is up.

## Quick start

Deploys into its own `airtrail` namespace (`.Values.namespace`):

```bash
helm upgrade --install airtrail ./charts/airtrail \
  --namespace airtrail --create-namespace \
  --set db.persistence.storageClass=local-path \
  --set airtrail.persistence.uploads.storageClass=local-path
```

Pods meet the Pod Security Standards **restricted** profile (the AirTrail pod runs as UID/GID 1000 with
`RuntimeDefault` seccomp, no privilege escalation and all capabilities dropped; the CNPG-managed Postgres
pods are restricted-compliant by default). To enforce it, label the namespace after creating it:

```bash
kubectl label ns airtrail pod-security.kubernetes.io/enforce=restricted --overwrite
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) runs exactly this
for the Talos cluster only; AirTrail is not deployed to GKE.

To go internal-only, set `airtrail.ingress.enabled=false` and port-forward:

```bash
kubectl port-forward -n airtrail svc/airtrail 3000:3000
```

## Secrets

`templates/secret.yaml` holds a `SealedSecret` named `airtrail-secret`. It is
sealed against one specific cluster's controller key, so it only decrypts on
that cluster. To reseal for another cluster (or after changing a value):

```bash
kubeseal --context <context> \
  --controller-name sealed-secrets-controller --controller-namespace kube-system \
  --format yaml < airtrail-secret.plain.yaml
```

Then paste the resulting `encryptedData` block into `templates/secret.yaml`.
Keep the plaintext file out of the chart and out of git.

Database credentials are **not** in this secret; they come from CNPG. If the
`ORIGIN` host changes, update `airtrail.ingress.hosts` and reseal `ORIGIN`
together.

## Storage

Both the database volume (`db.persistence`) and the uploads volume
(`airtrail.persistence.uploads`) leave `storageClass` blank, which uses the
cluster default. The deploy workflow sets both to `local-path` on Talos
(Rancher Local Path Provisioner; data lives on the node's user volume).
`local-path` volumes are node-local, so they survive pod restarts but not
losing the node.

## Key values

| Key                                         | Description                                           | Default                                      |
|---------------------------------------------|-------------------------------------------------------|----------------------------------------------|
| `namespace`                                 | Namespace every resource is created in                | `airtrail`                                   |
| `db.cnpg.instances`                         | Postgres instances in the CNPG cluster                | `1`                                          |
| `db.cnpg.imageName`                         | Postgres image for the cluster                        | `ghcr.io/cloudnative-pg/postgresql:18`       |
| `db.persistence.size`                       | Size of the Postgres data volume                      | `10Gi`                                       |
| `db.persistence.storageClass`               | StorageClass for the Postgres volume                  | cluster default                              |
| `db.resources`                              | Resource requests/limits for the Postgres pod         | `{}`                                         |
| `env.dbDatabaseName` / `env.dbUsername`     | Database and owner CNPG creates                       | `airtrail` / `airtrail`                      |
| `env.uploadLocation`                        | Mount path of the uploads volume                      | `/app/uploads`                               |
| `secret.existingSecret`                     | Name of the secret injected as env vars               | `airtrail-secret`                            |
| `airtrail.persistence.uploads.size`         | Size of the uploads volume                            | `2Gi`                                        |
| `airtrail.persistence.uploads.storageClass` | StorageClass for the uploads volume                   | cluster default                              |
| `airtrail.ingress.enabled`                  | Expose AirTrail via Ingress                           | `true`                                       |
| `airtrail.ingress.className`                | Ingress class                                         | `traefik`                                    |
| `airtrail.ingress.hosts`                    | Ingress host/path rules                               | `airtrail.georgetay.com`                     |
| `airtrail.ingress.tls`                      | Ingress TLS (empty: Cloudflare terminates TLS)        | `[]`                                         |

The CNPG operator is configured separately in the cluster repo; see its
`operator.yaml` for the chart version and monitoring settings.
