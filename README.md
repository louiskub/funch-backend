# FUNCH backend

NestJS API backed by PostgreSQL and MinIO. Use Node.js 24 or newer (`--env-file-if-exists` is used by the scripts). Install dependencies and start the local database from this directory:

```sh
npm ci
docker compose -p funch-ticket02 up -d postgres
cp .env.example .env
npm run db:setup
npm run start:dev
```

The compose project uses host port `15432` and a project-scoped volume. The `.env` file is loaded by the start, database, and admin-provision scripts; values already exported in the process take precedence. `db:setup` applies the checked-in catalog schema and repeatable demo seed. `db:migrate` and `db:seed` can be run separately. Configure `DATABASE_URL` for another database; the default local value is `postgres://car-rental:car-rental@localhost:15432/car-rental`.

Start only this project's isolated MinIO services (the command does not start or modify PostgreSQL):

```sh
docker compose -p funch-ticket05 up -d minio minio-init
```

MinIO listens on `19000` (S3 API) and `19001` (console), stores data in the `funch-ticket05_funch-minio-data` volume, and creates the `funch-assets` bucket. The app uses a bucket-scoped service account from `.env`; the bucket policy grants anonymous `GetObject` only for `public/*`. Root credentials are only used by the one-shot initializer. Never use `docker compose down -v` against a shared project.

The credentials in `.env.example` are local development values; set unique secrets for any shared or deployed MinIO instance.

Set `MINIO_ENDPOINT` to the backend's service endpoint and `MINIO_PUBLIC_ENDPOINT` to the browser-reachable endpoint. Local defaults use `http://localhost:19000` for both. Public upload is `POST /api/admin/files?visibility=PUBLIC` (multipart field `file`); private image upload is the same endpoint with `visibility=PRIVATE`. Both require an active admin session. Gallery order is saved with `POST /api/admin/fleet/car-types/:id/images` and `{ "imageFileIds": ["...", "..."] }`. `GET /api/admin/files` returns public files for selection. `GET /api/offers/:id` includes ordered `images` with direct public URLs. Admin private downloads use `GET /api/admin/files/:id/signed-get`; the response is no-store and the URL expires in 300 seconds. No private document UI is included.

If a metadata insert fails after MinIO accepts an upload, the API attempts immediate object removal. The scoped retry command removes only objects absent from `file_asset` and at least 24 hours old:

```sh
npm run files:cleanup-orphans
```

## Public catalog API

- `GET /api/health` → `{ "status": "ok" }`
- `GET /api/countries` → countries that have at least one active branch and active car offer
- `GET /api/countries/:countryCode/branches` → active branches in that country with an active offer
- `GET /api/branches/:branchId/offers` → active offers at that branch
- `GET /api/offers/:offerId` → active offer details, or `404`

Catalog responses include branch timezone and currency. Monetary numeric columns are serialized as exact decimal strings. Invalid UUID path parameters return `400`. Catalog endpoints filter inactive offers, car types, and branches through their relations.

## Customer authentication

- `POST /api/auth/register` accepts `name`, `email`, `password`, and `phone`; it creates an active `CUSTOMER` account and starts a session.
- `POST /api/auth/login` and `POST /api/auth/logout` create and revoke sessions.
- `GET /api/auth/me` and `PATCH /api/auth/me` read and update the current account profile. Profile fields are `name`, `email`, and `phone`.
- Sessions use opaque `funch_session` HttpOnly, SameSite=Lax cookies. Protected requests load the current role and suspension state from PostgreSQL.
- Browser state changes require the configured exact `FRONTEND_ORIGIN`; configure `FRONTEND_ORIGIN` and `DATABASE_URL` for deployment.
- For later protected routes, compose `SessionGuard` with `RolesGuard` and declare staff access with `@Roles(UserRole.ADMIN)`; use `StateChangeOriginGuard` on cookie-authenticated mutations.

Provision a demo admin only after applying migrations. The command requires explicit credentials and can promote/reset an account with the matching email:

```sh
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='use-a-private-12-plus-character-password' ADMIN_NAME='Demo Admin' ADMIN_PHONE='+66123456789' npm run admin:provision
```

## Tests

Unit tests and static checks:

```sh
npm test -- --runInBand
npm run build
npm run lint
```

The end-to-end suites use the local PostgreSQL service. Catalog tests read the seeded `car-rental` database. Auth, admin fleet, options, and files tests each use a separate database (`funch_ticket03_test`, `funch_ticket04_test`, `funch_ticket06_test`, and `funch_ticket05_test`). Create missing test databases, migrate them without dropping existing databases, and seed the files database with the checked-in demo branch used by its fixtures:

```sh
for db in funch_ticket03_test funch_ticket04_test funch_ticket06_test funch_ticket05_test; do
  docker exec -i funch-ticket02-postgres-1 psql -U car-rental -d car-rental -v ON_ERROR_STOP=1 -v db="$db" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db', 'car-rental')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SQL
  DATABASE_URL="postgres://car-rental:car-rental@localhost:15432/$db" npm run db:migrate
done
DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/funch_ticket05_test npm run db:seed
```

Start or refresh only the project's isolated MinIO service and its idempotent bucket/policy initializer (this does not touch PostgreSQL):

```sh
docker compose -p funch-ticket05 up -d minio minio-init
```

Run the complete integration suite serially with explicit, isolated database URLs and bucket:

```sh
DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/car-rental \
AUTH_TEST_DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/funch_ticket03_test \
ADMIN_TEST_DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/funch_ticket04_test \
OPTIONS_TEST_DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/funch_ticket06_test \
FILES_TEST_DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/funch_ticket05_test \
FILES_TEST_BUCKET=funch-assets-ticket05-test \
npm run test:e2e -- --runInBand
```
