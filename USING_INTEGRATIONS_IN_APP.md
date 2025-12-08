# Using Integrations in Your Application

Now that users can connect integrations via the settings page, here's how to use them throughout your app.

## Quick Example: Creating Short Links

### In a Server Action

```typescript
// app/actions/create-qr-link.ts
"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDubClient } from "@/lib/integrations/providers/dub/client";
import { hasIntegration } from "@/lib/integrations";

export async function createQRShortLink(url: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Check if user has Dub connected
  const hasDub = await hasIntegration(session.user.id, "dub");
  
  if (!hasDub) {
    return {
      success: false,
      error: "Please connect Dub.sh in your settings",
      code: "NOT_CONNECTED"
    };
  }

  try {
    // Get Dub client - automatically handles token refresh!
    const dub = await getDubClient(session.user.id);
    
    // Create short link
    const link = await dub.links.create({
      url,
      domain: "dub.sh",
      title: "QR Code Link",
    });

    return {
      success: true,
      shortLink: link.shortLink,
      linkId: link.id,
    };
  } catch (error) {
    console.error("Failed to create short link:", error);
    return {
      success: false,
      error: "Failed to create short link",
      code: "CREATE_FAILED"
    };
  }
}
```

### In a React Component

```typescript
// app/editor/qr/components/short-link-button.tsx
"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createQRShortLink } from "@/actions/create-qr-link";

export function ShortLinkButton({ url }: { url: string }) {
  const [loading, setLoading] = useState(false);
  const [shortLink, setShortLink] = useState<string | null>(null);

  const handleCreateShortLink = async () => {
    setLoading(true);
    
    try {
      const result = await createQRShortLink(url);
      
      if (result.success && result.shortLink) {
        setShortLink(result.shortLink);
        toast.success("Short link created!");
      } else if (result.code === "NOT_CONNECTED") {
        toast.error(result.error, {
          action: {
            label: "Connect",
            onClick: () => window.location.href = "/settings/integrations"
          }
        });
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (shortLink) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={shortLink}
          readOnly
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <Button
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(shortLink);
            toast.success("Copied to clipboard!");
          }}
        >
          Copy
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={handleCreateShortLink} disabled={loading}>
      {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
      <Link2 className="mr-2 size-4" />
      Create Short Link
    </Button>
  );
}
```

## Advanced Usage

### Get Link Analytics

```typescript
import { getLinkAnalytics } from "@/lib/integrations/providers/dub/utils";

export async function getQRAnalytics(linkId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  const analytics = await getLinkAnalytics(session.user.id, linkId, {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    end: new Date(),
  });

  return analytics;
}
```

### Check Integration Before Showing Feature

```typescript
import { hasIntegration } from "@/lib/integrations";

export default async function QREditorPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const hasDubIntegration = await hasIntegration(session.user.id, "dub");

  return (
    <div>
      {hasDubIntegration ? (
        <ShortLinkButton url="https://example.com" />
      ) : (
        <Button asChild variant="outline">
          <Link href="/settings/integrations">
            Connect Dub.sh to create short links
          </Link>
        </Button>
      )}
    </div>
  );
}
```

### Handle Integration Errors Gracefully

```typescript
import { getIntegration } from "@/lib/integrations";

export async function checkIntegrationHealth(userId: string) {
  const integration = await getIntegration(userId, "dub");

  if (!integration) {
    return {
      status: "not_connected",
      message: "Please connect Dub.sh in settings",
      action: "connect"
    };
  }

  if (integration.status === "error") {
    return {
      status: "error",
      message: "Your Dub.sh connection needs attention",
      action: "reconnect"
    };
  }

  return {
    status: "active",
    message: "Dub.sh is connected and working",
    action: null
  };
}
```

## UI Patterns

### Integration Status Indicator

```tsx
"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";

export function DubStatusBadge({ isConnected, status }: {
  isConnected: boolean;
  status?: "active" | "error" | "disconnected";
}) {
  if (!isConnected) {
    return (
      <Badge variant="outline">
        Not Connected
      </Badge>
    );
  }

  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" />
        Needs Reconnection
      </Badge>
    );
  }

  return (
    <Badge variant="default" className="gap-1">
      <CheckCircle className="size-3" />
      Connected
    </Badge>
  );
}
```

### Connect Prompt Dialog

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/design-system/components/ui/dialog";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";

export function ConnectDubDialog({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Dub.sh</DialogTitle>
          <DialogDescription>
            Create short links and track analytics for your QR codes by connecting your Dub.sh account.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Later
          </Button>
          <Button asChild>
            <Link href="/settings/integrations">
              Connect Now
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Best Practices

### 1. Always Check Connection First

```typescript
// ✅ Good
const hasDub = await hasIntegration(userId, "dub");
if (!hasDub) {
  return { error: "Please connect Dub.sh" };
}
const dub = await getDubClient(userId);

// ❌ Bad - will throw error if not connected
const dub = await getDubClient(userId);
```

### 2. Handle All Error Cases

```typescript
try {
  const dub = await getDubClient(userId);
  const link = await dub.links.create({ url });
  return { success: true, link };
} catch (error) {
  if (error.message.includes("not connected")) {
    return { error: "NOT_CONNECTED" };
  }
  if (error.message.includes("error")) {
    return { error: "NEEDS_RECONNECT" };
  }
  return { error: "UNKNOWN_ERROR" };
}
```

### 3. Provide Clear User Feedback

```typescript
// In UI component
if (error === "NOT_CONNECTED") {
  toast.error("Please connect Dub.sh", {
    action: {
      label: "Connect",
      onClick: () => router.push("/settings/integrations")
    }
  });
}
```

### 4. Cache Integration Status

```typescript
// Use React Query or similar for caching
const { data: hasDub } = useQuery({
  queryKey: ["integration", "dub"],
  queryFn: () => checkHasDubIntegration(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

## Common Use Cases

### 1. QR Code with Short Link

```typescript
export async function createQRWithShortLink(data: {
  originalUrl: string;
  qrData: any;
}) {
  const dub = await getDubClient(userId);
  
  // Create short link first
  const shortLink = await dub.links.create({
    url: data.originalUrl,
    title: "QR Code Link",
  });
  
  // Create QR code with short link
  const qr = await createQRCode({
    ...data.qrData,
    url: shortLink.shortLink,
  });
  
  return { qr, shortLink };
}
```

### 2. QR Code Analytics Dashboard

```typescript
export async function getQRAnalyticsDashboard(linkId: string) {
  const analytics = await getLinkAnalytics(userId, linkId);
  
  return {
    clicks: analytics.clicks,
    uniqueVisitors: analytics.uniqueVisitors,
    topCountries: analytics.countries,
    topDevices: analytics.devices,
  };
}
```

### 3. Bulk QR Creation

```typescript
export async function createBulkQRShortLinks(urls: string[]) {
  const dub = await getDubClient(userId);
  
  const links = await Promise.all(
    urls.map((url) =>
      dub.links.create({
        url,
        domain: "dub.sh",
      })
    )
  );
  
  return links;
}
```

## Testing Your Integration

### 1. Manual Testing

1. Go to `/settings/integrations`
2. Connect Dub.sh
3. Navigate to feature using integration
4. Verify it works
5. Disconnect and verify error handling
6. Reconnect and verify it works again

### 2. Error Simulation

Test these scenarios:
- Not connected → Shows prompt
- Connection error → Shows reconnect option
- Token expired → Auto-refreshes (should be transparent)
- API rate limit → Shows appropriate error

## Summary

Using integrations in your app is simple:

1. **Check connection**: `hasIntegration(userId, "dub")`
2. **Get client**: `getDubClient(userId)` (auto-refreshes tokens!)
3. **Use SDK**: Call any Dub SDK method
4. **Handle errors**: Guide users to connect/reconnect

The heavy lifting (OAuth, encryption, token refresh) is handled automatically by the integration system!

