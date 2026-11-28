import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

let testExitCode = 1;
let restoreExitCode = 1;

try {
  const result = spawnSync(
    npm,
    ["exec", "--", "playwright", "test", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  testExitCode = result.status ?? 1;

  if (result.error) {
    console.error(result.error);
  }
} finally {
  console.log("\nRestoring standard Next.js TypeScript references...");

  const result = spawnSync(
    npm,
    ["exec", "--", "next", "typegen"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NEXT_BUILD_DIR: ".next",
      },
    },
  );

  restoreExitCode = result.status ?? 1;

  if (result.error) {
    console.error(result.error);
  }
}

if (restoreExitCode !== 0) {
  console.error("Failed to restore standard Next.js TypeScript references.");
}

process.exitCode = testExitCode || restoreExitCode;
