# Integration System Setup Checklist

## ✅ What's Been Implemented

All the code for the integration system has been successfully created:

- ✅ Database schema defined (`apps/docs/db/schema.ts`)
- ✅ Migration file generated (`apps/docs/drizzle/0001_past_ironclad.sql`)
- ✅ Core integration infrastructure
- ✅ OAuth handlers and token refresh
- ✅ Dub.sh integration wrapper
- ✅ Settings page UI (`/settings/integrations`)
- ✅ Complete documentation

## ⚠️ What You Need to Do

### Step 1: Set Up Environment Variables

Create or update `apps/docs/.env` with these variables:

```env
# Database (you should already have this)
DATABASE_URL=postgresql://user:password@host/database

# Auth (you should already have these)
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_API_KEY=xxx

# Payments (you should already have these)
POLAR_ACCESS_TOKEN=xxx
POLAR_WEBHOOK_SECRET=xxx

# NEW: Dub OAuth Integration
DUB_CLIENT_ID=xxx
DUB_CLIENT_SECRET=xxx
DUB_REDIRECT_URI=http://localhost:3000/api/integrations/dub/callback

# NEW: Integration Encryption Key
INTEGRATION_ENCRYPTION_KEY=xxx
```

#### Get Dub OAuth Credentials

1. Go to https://app.dub.co/settings/oauth
2. Click "Create OAuth App"
3. Set these values:
   - **Name**: Your App Name (e.g., "QRDX")
   - **Redirect URI**: `http://localhost:3000/api/integrations/dub/callback`
   - **Scopes**: Select at minimum:
     - `workspaces.read`
     - `links.write`
     - `links.read`
4. Copy the Client ID and Client Secret
5. Add them to your `.env` file

#### Generate Encryption Key

Run this command to generate a secure 32-character encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and add it as `INTEGRATION_ENCRYPTION_KEY` in your `.env`.

### Step 2: Apply Database Migration

Once your `.env` is set up, apply the migration:

```bash
cd apps/docs
pnpm db:push
```

This will create the `integration` table in your database.

**Alternative:** You can also run the SQL directly in your database console:
- Open `apps/docs/drizzle/0001_past_ironclad.sql`
- Copy and paste the SQL into your Neon/Supabase console
- Execute it

### Step 3: Start Development Server

```bash
pnpm dev
```

### Step 4: Test the Integration

1. Navigate to `http://localhost:3000/settings/integrations`
2. Click "Connect Dub.sh"
3. Authorize with your Dub account
4. Verify you see "Connected" status

### Step 5: Use in Your Code

Now you can use the integration anywhere in your app:

```typescript
import { getDubClient } from "@/lib/integrations/providers/dub/client";

const dub = await getDubClient(session.user.id);
const link = await dub.links.create({
  url: "https://example.com"
});
```

## 🐛 Troubleshooting

### Error: "column 'scopes' does not exist"

**Cause:** Database migration hasn't been applied yet.

**Fix:** Follow Step 2 above to apply the migration.

### Error: "Invalid environment variables"

**Cause:** Missing required environment variables.

**Fix:** 
1. Check your `apps/docs/.env` file exists
2. Verify all variables from Step 1 are present
3. Restart your dev server

### Error: "Integration not found"

**Cause:** User hasn't connected the integration yet.

**Fix:** User needs to go to Settings → Integrations and connect Dub.sh.

### Error: "Token exchange failed"

**Cause:** OAuth credentials are incorrect or redirect URI doesn't match.

**Fix:**
1. Double-check `DUB_CLIENT_ID` and `DUB_CLIENT_SECRET`
2. Verify `DUB_REDIRECT_URI` matches exactly in Dub OAuth settings
3. Make sure the redirect URI in Dub includes the full URL with protocol

## 📚 Documentation Files

- `QUICK_START.md` - 5-minute setup guide
- `INTEGRATIONS_SETUP.md` - Comprehensive setup documentation
- `EXAMPLE_USAGE.tsx` - 10 code examples
- `INTEGRATION_SYSTEM_SUMMARY.md` - Architecture overview
- `INTEGRATIONS_FEATURE.md` - User-facing feature documentation
- `SETTINGS_PAGE_SUMMARY.md` - Settings page details
- `USING_INTEGRATIONS_IN_APP.md` - How to use in your code
- `APPLY_MIGRATION.md` - Migration instructions

## ✨ Quick Reference

### Check if User Has Integration

```typescript
import { hasIntegration } from "@/lib/integrations";

const isConnected = await hasIntegration(userId, "dub");
```

### Get Integration Details

```typescript
import { getIntegration } from "@/lib/integrations";

const integration = await getIntegration(userId, "dub");
```

### Use Dub SDK

```typescript
import { getDubClient } from "@/lib/integrations/providers/dub/client";

const dub = await getDubClient(userId);
// Automatically handles token refresh!
```

### Disconnect Integration

```typescript
import { disconnectIntegration } from "@/lib/integrations";

await disconnectIntegration(userId, "dub");
```

## 🎉 You're All Set!

Once you complete the checklist above, your integration system will be fully operational. Users will be able to:

1. Connect their Dub.sh account via OAuth
2. Create short links with analytics
3. Track QR code performance
4. Manage integrations from settings

The system handles all the complex stuff (OAuth, encryption, token refresh) automatically!

