// Source-text tests inspect the data layer; it lives in lib/db.ts (barrel) and lib/db/*.ts (domain modules).
import { readdirSync, readFileSync } from "node:fs";

const libDir = new URL("../lib/", import.meta.url);

export function readDbSources() {
  const parts = [readFileSync(new URL("db.ts", libDir), "utf8")];
  for (const file of readdirSync(new URL("db/", libDir)).sort()) {
    if (file.endsWith(".ts")) parts.push(readFileSync(new URL(`db/${file}`, libDir), "utf8"));
  }
  return parts.join("\n");
}

/** Returns the source of one top-level function declaration (up to its closing brace at column 0). */
export function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\b`));
  if (start < 0) throw new Error(`Function ${name} not found`);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end < 0 ? undefined : end + 3);
}

/** Concatenates every .ts file in a directory (server-action modules split by domain). */
export function readDirSources(relativeDir) {
  const dir = new URL(`../${relativeDir.replace(/\/?$/, "/")}`, import.meta.url);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map((file) => readFileSync(new URL(file, dir), "utf8"))
    .join("\n");
}
