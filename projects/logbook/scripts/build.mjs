import { mkdir, copyFile, readdir } from "node:fs/promises";
import { join } from "node:path";
await mkdir("dist", { recursive: true });
for (const name of await readdir("public"))
  await copyFile(join("public", name), join("dist", name));
await copyFile("src/analyzer.js", "dist/analyzer.js");
await copyFile("samples/demo.jsonl", "dist/demo.jsonl");
console.log("Logbook built into dist/");
