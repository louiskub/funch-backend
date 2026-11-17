# FUNCH backend

NestJS API backed by PostgreSQL and MinIO. Use Node.js 24 or newer (`--env-file-if-exists` is used by the scripts). Install dependencies and start the local database from this directory:

```sh
npm ci
docker compose -p funch-ticket02 up -d postgres
cp .env.example .env
npm run db:setup
npm run start:dev
```

The compose project uses host port `15432` and a project-scoped volume. The `.env` file is loaded by the start and database scripts; values already exported in the process take precedence. Database migrations are temporarily removed while the Entity model is rebuilt. `db:migrate` is therefore a no-op, and `db:setup` does not create or alter tables. Configure `DATABASE_URL` for another database and set `DATABASE_SSL=true` when the server requires TLS; the default local URL is `postgres://car-rental:car-rental@localhost:15432/car-rental`.

The repeatable seed inserts missing countries, airport branches, car types, offers, cars, options, local demo accounts, and bookings in one transaction. It requires a database whose schema already matches the Entities. It preserves existing rows, including country/branch details, gallery order, rates, activation flags, and car status; it is not a reset command. It includes local demo logins (`demo-customer@example.test` and `demo-admin@example.test`, password `FunchDemo2026!`), so use it only with development data.

## Booking demo data

Use the existing local PostgreSQL database named `car-rental`. With the default `.env`, run:

```sh
npm run db:seed-demo
```

The command refuses non-local hosts and databases other than `car-rental`. It is repeatable and resets the fixed demo bookings, sessions, and options; it updates the fixed demo accounts in place and replaces the seeded Camry and Model 3 galleries with the demo photos. It seeds three customers and one administrator, including a suspended customer, all using the local-only password `FunchDemo2026!` (the suspended account cannot log in). Customer histories cover pending, approved, in-use, return review, completed, cancelled, and rejected bookings across two countries and currencies. Confirmed and pending charges, one-stock child seats, and two public gallery images for each car type are included. The gallery photos are downloaded from Unsplash and their source links are in `assets/demo-cars/SOURCES.md`. Price snapshots are created through the core pricing functions.

Demo logins: `demo-customer@example.test`, `demo-customer-2@example.test`, and `demo-admin@example.test`; password `FunchDemo2026!`. The suspended member is listed as `demo-suspended@example.test` and cannot log in. Suggested two-session walkthrough: open member history for each customer, inspect all booking status filters and the return-review queue, then quote an offer, submit a new pending request, approve it, assign the matching branch car at pickup, record a return, review charges, inspect galleries, and open reports filtered to the booking creation dates.

## Currency reference data

`Currency` lives in `src/modules/catalog/entities/currency.entity.ts`. Its primary key is `code`, with `name` and `minorUnits` mapped to `minor_units`. Its current reference data includes THB, USD, JPY, SGD, MYR, KRW, AUD, GBP, CAD, and AED. Unknown offer currencies return `400` on create or update. Minor-unit metadata does not change rental calculations or rounding.

No Currency CRUD API or UI is included. Schema migrations are temporarily removed while the Entity model is rebuilt; regenerate them before setting up or upgrading a database.

## HTTP bootstrap and API documentation

The API keeps the `/api` prefix. Swagger UI is available at `/docs`, with the OpenAPI document at `/docs/json`. The document uses the title `FUNCH API` and describes session-cookie authentication through `funch_session`. The Swagger compiler plugin derives request schemas from the DTOs. JSON is served over HTTP without writing a file at startup.

Helmet sets the HTTP security headers. CORS allows the configured `FRONTEND_ORIGIN` with credentials. Swagger uses an existing browser session; its authorization control cannot set an HttpOnly cookie.

`AppModule` registers one global validation pipe, response interceptor, and exception filter. Validation transforms DTOs, rejects undeclared fields, and keeps declared validated fields. Controllers do not register duplicate pipes. `common/` contains shared classes without a `CommonModule`.

Both success and error responses use `{ status: { code, messages }, data }`. Errors have `data: null`, and validation messages are joined into `status.messages`. Server errors return `Internal server error` while their diagnostic details stay in server logs. The frontend reads error messages and preserves the HTTP status in `ApiError`.

## File storage

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

- `GET /api/health` → `{ "status": { "code": 200, "messages": "OK" }, "data": { "status": "ok" } }`
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
- For later protected routes, compose `SessionAuthGuard` with `RoleGuard` and declare staff access with `@Roles(UserRole.ADMIN)`.

Provision a demo admin only after preparing a database schema that matches the Entities. The command requires explicit credentials and can promote/reset an account with the matching email:

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

End-to-end tests that require PostgreSQL or MinIO have been removed. Unit tests and static checks remain available through the commands above.

## Production dependency audit

The 2026-11-15 production audit reports seven package findings: four through MinIO, described below, and three through the existing TypeORM `glob`/`minimatch` chain. The bootstrap changes do not resolve those existing dependency findings.

As of 2026-11-14, `npm audit --omit=dev` reports four package findings through MinIO 8.0.7: `query-string@7.1.3` resolves `decode-uri-component@0.2.2` (including [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f)), and MinIO also includes `stream-json@1.9.1` (including [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), and [GHSA-mjw6-4jj6-33hc](https://github.com/uhop/stream-json/security/advisories/GHSA-mjw6-4jj6-33hc)). The registry currently lists 8.0.7 as the latest MinIO release, and it still declares both dependency ranges. npm's suggested MinIO 7.1.3 major downgrade still depends on `query-string@7`; it does not resolve the decoder finding. The patched decoder and stream-json releases are ESM packages while these MinIO/query-string call sites load through CommonJS. This project does not apply those cross-major overrides or the SDK downgrade without a supported upstream release and MinIO integration coverage.

The affected parser paths are not called by the app today: MinIO uses `query-string.stringify` for its request and signing parameters, not `parse`; its streaming JSON parser is used by bucket notification listeners. The app only uses MinIO object upload, removal, presigned download, and orphan listing, and does not configure or call bucket notifications. Keep the audit finding visible and recheck it when upgrading MinIO or adding notification handling; this reachability assessment does not make `npm audit` clean.
