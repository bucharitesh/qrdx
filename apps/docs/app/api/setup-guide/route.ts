import { handleError } from "@/lib/error-response";
import { can } from "@/lib/permissions";
import { getActiveWorkspace } from "@/lib/scope";
import type { SetupGuideResponse } from "@/lib/setup-guide";
import { getSetupTasks } from "@/lib/setup-guide-server";

/**
 * The app shell's "Get set up" launcher (components/app-shell/setup-guide.tsx)
 * asks here, for the workspace the tab has open (the x-qrdx-workspace header,
 * else the session's). Signed-in sessions only; never cached.
 */
export async function GET(request: Request) {
  try {
    const { scope, workspace } = await getActiveWorkspace(request.headers);
    const body: SetupGuideResponse = {
      workspaceId: workspace.id,
      tasks: can(scope.role, "content.write")
        ? await getSetupTasks(scope)
        : null,
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error, { route: "GET /api/setup-guide" });
  }
}
