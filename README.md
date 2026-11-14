# FUNCH backend

NestJS API backed by PostgreSQL. Use Node.js 24 or newer (`--env-file-if-exists` is used by the scripts). Install dependencies and start the local database from this directory:

```sh
npm ci
docker compose -p funch-ticket02 up -d postgres
cp .env.example .env
npm run db:setup
npm run start:dev
```

The compose project uses host port `15432` and a project-scoped volume. The `.env` file is loaded by the start, database, and admin-provision scripts; values already exported in the process take precedence. `db:setup` applies the checked-in catalog schema and repeatable demo seed. `db:migrate` and `db:seed` can be run separately. Configure `DATABASE_URL` for another database; the default local value is `postgres://car-rental:car-rental@localhost:15432/car-rental`.

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

The end-to-end suites use the local PostgreSQL service. Catalog tests read the seeded `car-rental` database. Auth, admin fleet, and options tests each use a separate database (`funch_ticket03_test`, `funch_ticket04_test`, and `funch_ticket06_test`); create-if-missing and migrate them without dropping existing databases:

```sh
for db in funch_ticket03_test funch_ticket04_test funch_ticket06_test; do
  docker exec -i funch-ticket02-postgres-1 psql -U car-rental -d car-rental -v ON_ERROR_STOP=1 -v db="$db" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db', 'car-rental')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SQL
  DATABASE_URL="postgres://car-rental:car-rental@localhost:15432/$db" npm run db:migrate
done
```

Run the complete integration suite serially with explicit, isolated database URLs:

```sh
DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/car-rental \
AUTH_TEST_DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/funch_ticket03_test \
ADMIN_TEST_DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/funch_ticket04_test \
OPTIONS_TEST_DATABASE_URL=postgres://car-rental:car-rental@localhost:15432/funch_ticket06_test \
npm run test:e2e -- --runInBand
```
