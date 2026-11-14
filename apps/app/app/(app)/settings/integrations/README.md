# Integrations Settings Page

This page allows users to connect and manage third-party integrations like Dub.sh.

## Features

- ✅ View available integrations
- ✅ Connect/disconnect integrations via OAuth
- ✅ See connection status (active, error, disconnected)
- ✅ View workspace/account details for connected integrations
- ✅ Automatic token refresh (handled by integration system)
- ✅ Error handling with toast notifications

## Components

### IntegrationCard
Displays an integration with:
- Name and description
- Connection status badge
- Connect/Disconnect buttons
- Metadata (workspace info)
- Logo

### Actions
Server actions for:
- `connectIntegrationAction` - Initiates OAuth flow
- `disconnectIntegrationAction` - Removes integration

## User Flow

1. User visits `/settings/integrations`
2. Sees available integrations (Dub.sh)
3. Clicks "Connect Dub.sh"
4. Redirected to Dub OAuth page
5. Authorizes the app
6. Redirected back to `/settings/integrations?success=dub_connected`
7. Integration card shows "Connected" status
8. Can disconnect at any time

## OAuth Flow

```
User clicks Connect
    ↓
connectIntegrationAction
    ↓
Generate PKCE code verifier
    ↓
Store in cookie
    ↓
Generate auth URL
    ↓
Redirect to Dub OAuth
    ↓
User authorizes
    ↓
Redirect to /api/integrations/dub/callback
    ↓
Exchange code for tokens
    ↓
Save to database (encrypted)
    ↓
Redirect to /settings/integrations?success=dub_connected
```

## Adding New Integrations

To add a new integration (e.g., Google Analytics):

1. Add integration card to page:
```tsx
<IntegrationCard
  name="Google Analytics"
  slug="google-analytics"
  description="Track QR code scans"
  logo="/integrations/ga-icon.svg"
  isConnected={!!gaIntegration}
  status={gaIntegration?.status}
  metadata={gaIntegration?.metadata}
  connectedAt={gaIntegration?.createdAt}
/>
```

2. The actions already support any provider via the registry system!

## Styling

Uses shadcn/ui components:
- Card
- Badge
- Button
- Toast notifications via Sonner






