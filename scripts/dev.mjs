#!/usr/bin/env node
/**
 * One-command dev runner for OpsRadar (no dependencies).
 *
 *   node scripts/dev.mjs            # API on :8000 + UI on :3000 (real backend)
 *   node scripts/dev.mjs --mock     # UI only, replaying frontend/mocks/*.json
 *   node scripts/dev.mjs --only=backend|frontend
 *   node scripts/dev.mjs --check    # backend pytest + frontend typecheck
 *
 * Both children are stopped together on Ctrl+C / SIGTERM.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const mock = args.includes("--mock");
const check = args.includes("--check");
const only = (args.find((arg) => arg.startsWith("--only=")) || "").split("=")[1];
const API_PORT = process.env.API_PORT || "8000";
const WEB_PORT = process.env.WEB_PORT || "3000";
const isWindows = process.platform === "win32";

const colours = { api: "\x1b[36m", web: "\x1b[35m", dim: "\x1b[2m", reset: "\x1b[0m" };

function venvPython() {
  const candidates = isWindows
    ? [path.join(ROOT, "backend", ".venv", "Scripts", "python.exe")]
    : [path.join(ROOT, "backend", ".venv", "bin", "python")];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function runCheck() {
  const python = venvPython();
  if (!python) {
    console.error("No backend virtualenv found. Create it first:\n  cd backend && python -m venv .venv && pip install -r requirements.txt");
    process.exit(1);
  }
  console.log("== backend: pytest ==");
  const pytest = spawnSync(python, ["-m", "pytest", "tests", "-q"], {
    cwd: path.join(ROOT, "backend"),
    stdio: "inherit",
    shell: false,
  });
  console.log("== frontend: tsc --noEmit ==");
  const tsc = spawnSync(isWindows ? "npm.cmd" : "npm", ["run", "typecheck"], {
    cwd: path.join(ROOT, "frontend"),
    stdio: "inherit",
    shell: false,
  });
  const failed = pytest.status !== 0 || tsc.status !== 0;
  process.exit(failed ? 1 : 0);
}

if (check) runCheck();

const children = [];

function start(label, command, commandArgs, cwd, extraEnv = {}) {
  const child = spawn(command, commandArgs, {
    cwd,
    env: { ...process.env, ...extraEnv },
    shell: isWindows && command === "npm",
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push({ label, child });
  const prefix = `${colours[label]}${label.padEnd(3)}${colours.reset} ${colours.dim}│${colours.reset} `;
  const pipe = (stream) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) stop(child);
  setTimeout(() => process.exit(code), 150);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => children.forEach(({ child }) => stop(child)));

const python = venvPython();
if (!python && only !== "frontend") {
  const create = isWindows
    ? "cd backend\r\npython -m venv .venv\r\n.venv\\Scripts\\python -m pip install -r requirements.txt"
    : "cd backend\npython -m venv .venv\n.venv/bin/python -m pip install -r requirements.txt";
  console.error(`Backend virtualenv not found. Set it up once:\n\n${create}\n`);
  process.exit(1);
}

if (only !== "frontend" && !mock) {
  start("api", python, ["-m", "uvicorn", "app.main:app", "--reload", "--port", API_PORT], path.join(ROOT, "backend"));
  console.log(`${colours.api}api${colours.reset}  http://127.0.0.1:${API_PORT}/api/health`);
}

if (only !== "backend") {
  start("web", "npm", ["run", "dev", "--", "-p", WEB_PORT], path.join(ROOT, "frontend"), {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || `http://localhost:${API_PORT}`,
    ...(mock ? { NEXT_PUBLIC_USE_MOCK: "true" } : {}),
  });
  console.log(`${colours.web}web${colours.reset}  http://localhost:${WEB_PORT}${mock ? "  (mock mode)" : ""}`);
}
