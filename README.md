# FUNCH backend

NestJS API backed by PostgreSQL. Start the local database from this directory:

```sh
docker compose -p funch-ticket02 up -d postgres
cp .env.example .env
npm run db:setup
npm run start:dev
```

The compose project uses host port `15432` and a project-scoped volume. `db:setup` applies the checked-in catalog schema and repeatable demo seed. `db:migrate` and `db:seed` can be run separately. Configure `DATABASE_URL` for another database; the default local value is `postgres://car-rental:car-rental@localhost:15432/car-rental`.

## Public catalog API

- `GET /api/health` → `{ "status": "ok" }`
- `GET /api/countries` → countries that have at least one active branch and active car offer
- `GET /api/countries/:countryCode/branches` → active branches in that country with an active offer
- `GET /api/branches/:branchId/offers` → active offers at that branch
- `GET /api/offers/:offerId` → active offer details, or `404`

Catalog responses include branch timezone and currency. Monetary numeric columns are serialized as exact decimal strings. Invalid UUID path parameters return `400`. Catalog endpoints filter inactive offers, car types, and branches through their relations.

Run the DB-backed API integration suite after `db:setup` with `DATABASE_URL` set:

```sh
DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/car-rental npm run test:e2e -- --runInBand
npm run build
npm run lint
```
