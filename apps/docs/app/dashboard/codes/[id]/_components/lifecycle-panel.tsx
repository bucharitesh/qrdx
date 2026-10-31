import { getCodeLifecycle } from "@/actions/code-lifecycle";
import { LifecyclePanelForm } from "./lifecycle-panel-form";

/** "Access & schedule" settings: pause, password, start/end dates, scan limit, fallback. */
export async function LifecyclePanel({ codeId }: { codeId: string }) {
  const result = await getCodeLifecycle(codeId);
  if (!result.success) return null;
  return <LifecyclePanelForm initial={result.data} />;
}
