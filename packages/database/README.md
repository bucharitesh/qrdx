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

### Generate Migrations

```bash
pnpm db:generate
```

### Apply Migrations

```bash
pnpm db:migrate
```

### Push Schema Changes (Development)

```bash
pnpm db:push
```

### Open Drizzle Studio

```bash
pnpm db:studio
```

## Environment Variables

Create a `.env` file with:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

See `.env.example` for reference.

