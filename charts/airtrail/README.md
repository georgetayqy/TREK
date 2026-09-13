# AirTrail Helm Chart

Deploys [AirTrail](https://github.com/johly/airtrail) with its PostgreSQL
database on Kubernetes. Converted from the upstream `docker-compose.yml` and
`.env` sample.

## What it creates

- `Secret` — holds `ORIGIN`, `DB_URL`, `DB_PASSWORD`, and the other values
  from the sample `.env`, based on `values.yaml`.
- `Deployment` + `Service` + `PersistentVolumeClaim` for PostgreSQL
  (equivalent to the `db` compose service / `db_data` volume).
- `Deployment` + `Service` + `PersistentVolumeClaim` for AirTrail itself
  (equivalent to the `airtrail` compose service / `uploads` volume), with an
  init container that waits for Postgres to become ready (replaces
  `depends_on: condition: service_healthy`, which has no direct Kubernetes
  equivalent).
- Optional `Ingress`.

## Quick start

Deploys into its own `airtrail` namespace (`.Values.namespace`), matching the
`trek` chart's convention of one namespace per app:

```bash
kubectl create namespace airtrail
helm install airtrail ./airtrail \
  --namespace airtrail \
  --set secret.dbPassword=$(openssl rand -hex 16)
```

`secret.dbPassword` in `values.yaml` is a `CHANGEME` placeholder on purpose —
never commit a real password there. Pass the real one at install time via
`--set`, or with a gitignored `-f values-secret.yaml` if you'd rather not put
it on the command line. (Unlike `trek`, this chart does not yet use Bitnami
`SealedSecret`s — if you want the DB password committed to git safely the way
`trek`'s secrets are, that template needs converting first.)

Ingress is enabled by default, exposing AirTrail at `https://airtrail.georgetay.com`
via the same nginx + cert-manager + external-dns stack `trek`'s ingress uses.
To use a different hostname, override `airtrail.ingress.hosts`,
`airtrail.ingress.tls` and `airtrail.ingress.annotations."external-dns.alpha.kubernetes.io/hostname"`,
and `env.origin` together. To go internal-only instead, set
`airtrail.ingress.enabled=false` and port-forward:

```bash
kubectl port-forward -n airtrail svc/airtrail 3000:3000
```

## Storage

Both PVCs (`db.persistence` and `airtrail.persistence.uploads`) leave
`storageClass` blank, which uses the cluster's default StorageClass
(`standard-rwo`, GCE PD, on this cluster). A dedicated local-storage
provisioner was tried and reverted: the cluster has no local SSD hardware,
and GKE blocks the `rancher.io/local-path` provisioner's helper pod from
running in a non-`kube-system` namespace (`system-node-critical`/
`system-cluster-critical` priority classes are quota-restricted outside
`kube-system`), so `local-path-provisioner` can't provision volumes here.

## Key values

| Key                                         | Description                                          | Default                          |
|---------------------------------------------|------------------------------------------------------|----------------------------------|
| `namespace`                                 | Namespace every resource is created in               | `airtrail`                       |
| `env.origin`                                | Public URL AirTrail is served at (sets `ORIGIN`)     | `https://airtrail.georgetay.com` |
| `secret.dbPassword`                         | Postgres password (A-Za-z0-9 only)                   | `CHANGEME` — override at install |
| `secret.dbUrl`                              | Override to point at an external database            | auto-generated                   |
| `db.persistence.size`                       | Size of the Postgres data volume                     | `5Gi`                            |
| `db.persistence.storageClass`               | StorageClass for the Postgres volume                 | cluster default                  |
| `airtrail.persistence.uploads.size`         | Size of the uploads volume                           | `1Gi`                            |
| `airtrail.persistence.uploads.storageClass` | StorageClass for the uploads volume                  | cluster default                  |
| `airtrail.ingress.enabled`                  | Expose AirTrail via Ingress                          | `true`                           |
| `airtrail.ingress.hosts`                    | Ingress host/path rules                              | `airtrail.georgetay.com`         |
| `env.mapProvider` / `env.map*`              | Optional basemap provider settings (see values.yaml) | unset                            |

**Always override `secret.dbPassword`** before deploying — see `values.yaml`
for the full list of options, including the optional CARTO/Protomaps basemap
variables.

If you already manage the secret yourself, set `secret.create: false` and
`secret.existingSecret: <name>`; the secret must contain the same keys as
`templates/secret.yaml`.
