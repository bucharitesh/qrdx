import { execSync } from "node:child_process";
import { join } from "node:path";

export default function setup() {
  execSync("pnpm build", {
    cwd: join(__dirname),
    stdio: "pipe",
  });
}
