# @repo/database

Shared database package for the QRDX monorepo.

## Features

- **Drizzle ORM** with Neon Postgres
- **Type-safe** schema and queries
- **Centralized** database configuration
- **Environment validation** with `@t3-oss/env-nextjs`

## Usage

```typescript
import { database, user, session, qrPreset } from "@repo/database";

// Use the database client
const users = await database.select().from(user);

// Export all schema tables for queries
```

## Schema

The database schema includes:
- `user` - User accounts
- `session` - User sessions
- `account` - OAuth accounts
- `verification` - Email verification tokens
- `qrPreset` - QR code themes/presets
- `aiUsage` - AI usage tracking
- `subscription` - Subscription management
- `integration` - Third-party integrations

## Development

Run these from the repository root. Each one works on the database that `DATABASE_URL` points at, so only run the ones that write (`db:migrate`, `db:push`) against a development database of your own that you can throw away.

### Generate Migrations

```bash
bun run db:generate
```

### Apply Migrations

```bash
bun run db:migrate
```

### Push Schema Changes (Development)

```bash
bun run db:push
```

### Open Drizzle Studio

```bash
bun run --filter @repo/database studio
```

## Environment Variables

Create a `.env` file with:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

See `.env.example` for reference.





