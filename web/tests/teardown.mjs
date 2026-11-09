import { rmSync } from "node:fs";
export default async function teardown(config) {
  rmSync(config.metadata.dataDir, { recursive: true, force: true });
}
