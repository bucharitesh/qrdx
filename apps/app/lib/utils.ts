// @ts-expect-error: owned by ngard
import { isEqual } from "@ngard/tiny-isequal";

export function isDeepEqual(a: unknown, b: unknown): boolean {
  return isEqual(a, b);
}
