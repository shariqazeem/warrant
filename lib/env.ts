/** Scripts read `.env.local`. Next.js loads it on its own; a bare `tsx` run does not. */
import {config} from "dotenv";
import {existsSync} from "node:fs";
import {resolve} from "node:path";

let loaded = false;

export function loadEnv(): {found: boolean; path: string} {
  const path = resolve(process.cwd(), ".env.local");
  const found = existsSync(path);
  if (found && !loaded) {
    config({path, quiet: true});
    loaded = true;
  }
  return {found, path};
}
