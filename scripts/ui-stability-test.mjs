/* global document */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const durationMinutes = Number(process.env.UI_STABILITY_MINUTES ?? "240");
const intervalSeconds = Number(process.env.UI_STABILITY_INTERVAL_SECONDS ?? "30");
const apiPort = Number(process.env.UI_STABILITY_API_PORT ?? "4318");
const webPort = Number(process.env.UI_STABILITY_WEB_PORT ?? "4182");
const reportPath = resolve(
  process.env.UI_STABILITY_REPORT_PATH ?? join(projectRoot, "logs", "ui-stability-report.json"),
);
if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("UI_STABILITY_MINUTES_INVALID");
if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) throw new Error("UI_STABILITY_INTERVAL_SECONDS_INVALID");
if (apiPort !== 4318) throw new Error("UI_STABILITY_API_PORT_MUST_BE_4318");
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65_535) throw new Error("UI_STABILITY_WEB_PORT_INVALID");

const temporaryDirectory = await mkdtemp(join(tmpdir(), "xinxisuyang-ui-stability-"));
const databasePath = join(temporaryDirectory, "ui-stability.sqlite");
const chromeProfilePath = join(temporaryDirectory, "chrome-profile");
const apiBase = `http://127.0.0.1:${apiPort}`;
const webBase = `http://127.0.0.1:${webPort}`;
const key = Buffer.alloc(32, 23).toString("base64");
const startedAt = new Date();
const samples = [];
const childProcesses = [];
let browserContext;
let runError;
let transientRequestFailures = 0;
let lastObserved = null;

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function request(path, init) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}${path}`, init);
      if (!response.ok) throw new Error(`HTTP_${response.status}_${path}`);
      return response.json();
    } catch (error) {
      lastError = error;
      transientRequestFailures += 1;
      if (attempt < 2) await delay(100 * (attempt + 1));
    }
  }
  throw lastError;
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local process is still starting.
    }
    await delay(500);
  }
  throw new Error(`LOCAL_URL_TIMEOUT_${url}`);
}

async function commandOutput(command, args) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  for await (const chunk of child.stdout) output += chunk.toString();
  const exitCode = await new Promise((resolveExit) => child.once("close", resolveExit));
  if (exitCode !== 0) throw new Error(`COMMAND_FAILED_${command}`);
  return output;
}

async function residentMemoryMb(pid) {
  const output = await commandOutput("ps", ["-o", "rss=", "-p", String(pid)]);
  return Number(output.trim()) / 1024;
}

async function chromeMemoryMb() {
  const output = await commandOutput("ps", ["-axo", "rss=,command="]);
  return output.split("\n").reduce((total, line) => {
    const match = line.match(/^\s*(\d+)\s+(.+)$/u);
    if (match === null || !match[2]?.includes(chromeProfilePath)) return total;
    return total + Number(match[1]) / 1024;
  }, 0);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    delay(5_000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function saveReport(report) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log((await readFile(reportPath, "utf8")).trim());
  console.log(`UI 稳定性报告已保存：${reportPath}`);
}

try {
  const server = spawn("node", ["apps/server/dist/index.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(apiPort),
      DATABASE_PATH: databasePath,
      COLUMN_KEY_BASE64: key,
      PAIRING_TOKEN: "ui-stability-token",
      WEB_ORIGIN: webBase,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  childProcesses.push(server);
  const web = spawn(
    "pnpm",
    ["--filter", "@xinxisuyang/web", "exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] },
  );
  childProcesses.push(web);

  await Promise.all([waitForUrl(`${apiBase}/health`), waitForUrl(webBase)]);
  await request("/api/event-rules", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rules: [{ event: "智能创作", minScore: "0", maxScore: "120", enabled: true }] }),
  });
  const rows = Array.from({ length: 501 }, (_, index) =>
    `东部赛区\t智能创作\t小学组\t演练选手${index + 1}\t${80 + (index % 21)}.${String(index % 100).padStart(2, "0")}`,
  );
  const importBody = {
    format: "clipboard",
    text: ["赛区\t赛项\t组别\t选手姓名\t成绩", ...rows].join("\n"),
    mapping: {
      region: "赛区",
      event: "赛项",
      group: "组别",
      participantName: "选手姓名",
      scoreRaw: "成绩",
    },
  };
  const preview = await request("/api/import/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(importBody),
  });
  const published = await request("/api/import/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...importBody, expectedHash: preview.hash }),
  });
  const expectedSnapshotId = published.snapshot.id;

  browserContext = await chromium.launchPersistentContext(chromeProfilePath, {
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const existingPages = browserContext.pages();
  const adminPage = existingPages[0] ?? await browserContext.newPage();
  await adminPage.goto(webBase);
  await adminPage.locator(".ranking-table tbody tr").first().waitFor({ state: "visible" });
  const displayPage = await browserContext.newPage();
  await displayPage.goto(`${webBase}/display`);
  await displayPage.locator(".display-row").first().waitFor({ state: "visible" });

  const endAt = Date.now() + durationMinutes * 60_000;
  while (Date.now() < endAt) {
    const [status, rankings, display, snapshots, adminState, displayState, serverRssMb, browserRssMb] = await Promise.all([
      request("/api/status"),
      request("/api/rankings"),
      request("/api/display"),
      request("/api/snapshots"),
      adminPage.evaluate(() => ({
        title: document.querySelector("h1")?.textContent?.trim() ?? "",
        rowCount: document.querySelectorAll(".ranking-table tbody tr").length,
        connectionError: document.querySelector(".inline-alert--red")?.textContent?.trim() ?? null,
      })),
      displayPage.evaluate(() => ({
        title: document.querySelector("h1")?.textContent?.trim() ?? "",
        rowCount: document.querySelectorAll(".display-row").length,
        snapshotLabel: document.querySelector(".display-snapshot-id")?.textContent?.trim() ?? "",
        warningVisible: document.querySelector(".display-warning") !== null,
      })),
      residentMemoryMb(server.pid),
      chromeMemoryMb(),
    ]);
    lastObserved = {
      statusState: status.state,
      apiSnapshotId: rankings.snapshot.id,
      displayDtoSnapshotId: display.snapshotId,
      rankingRowCount: rankings.rows.length,
      displayDtoRowCount: display.rows.length,
      snapshotCount: snapshots.snapshots.length,
      adminState,
      displayState,
    };
    if (status.state !== "synced") throw new Error("UI_STATUS_DRIFT");
    if (snapshots.snapshots.length !== 1) throw new Error("UI_DUPLICATE_SNAPSHOT");
    if (rankings.snapshot.id !== expectedSnapshotId || display.snapshotId !== expectedSnapshotId) {
      throw new Error("UI_API_SNAPSHOT_DRIFT");
    }
    if (rankings.rows.length !== 501 || display.rows.length !== 501) throw new Error("UI_API_ROW_COUNT_DRIFT");
    if (adminState.title !== "赛事指挥台" || adminState.rowCount !== 8 || adminState.connectionError !== null) {
      throw new Error("ADMIN_RENDER_DRIFT");
    }
    if (
      displayState.title !== "智能创作" ||
      displayState.rowCount < 1 ||
      displayState.rowCount > 12 ||
      !displayState.snapshotLabel.includes(expectedSnapshotId.slice(0, 8))
    ) {
      throw new Error("DISPLAY_RENDER_DRIFT");
    }
    if (browserRssMb <= 0) throw new Error("CHROME_MEMORY_UNAVAILABLE");
    samples.push({
      at: new Date().toISOString(),
      snapshotId: expectedSnapshotId,
      rankingRowCount: rankings.rows.length,
      displayDtoRowCount: display.rows.length,
      adminRows: adminState.rowCount,
      displayRows: displayState.rowCount,
      displayWarningVisible: displayState.warningVisible,
      serverRssMb: Number(serverRssMb.toFixed(2)),
      browserRssMb: Number(browserRssMb.toFixed(2)),
    });
    await delay(Math.min(intervalSeconds * 1000, Math.max(0, endAt - Date.now())));
  }

  const serverMemory = samples.map((sample) => sample.serverRssMb);
  const browserMemory = samples.map((sample) => sample.browserRssMb);
  const serverMemoryGrowthMb = Math.max(...serverMemory) - Math.min(...serverMemory);
  const browserMemoryGrowthMb = Math.max(...browserMemory) - Math.min(...browserMemory);
  if (serverMemoryGrowthMb > 128) throw new Error(`UI_SERVER_MEMORY_GROWTH_${serverMemoryGrowthMb.toFixed(2)}MB`);
  if (browserMemoryGrowthMb > 384) throw new Error(`UI_CHROME_MEMORY_GROWTH_${browserMemoryGrowthMb.toFixed(2)}MB`);
  if (transientRequestFailures > 3) throw new Error(`UI_TRANSIENT_FAILURES_${transientRequestFailures}`);
  await saveReport({
    result: "passed",
    mode: "manual-only-ui",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMinutes,
    intervalSeconds,
    sampleCount: samples.length,
    snapshotCount: 1,
    rowCount: 501,
    transientRequestFailures,
    serverMemoryGrowthMb: Number(serverMemoryGrowthMb.toFixed(2)),
    browserMemoryGrowthMb: Number(browserMemoryGrowthMb.toFixed(2)),
    samples,
  });
} catch (error) {
  runError = error instanceof Error ? error.message : "UNKNOWN_UI_STABILITY_ERROR";
  await saveReport({
    result: "failed",
    mode: "manual-only-ui",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMinutes,
    intervalSeconds,
    transientRequestFailures,
    error: runError,
    lastObserved,
    samples,
  });
  throw error;
} finally {
  if (browserContext !== undefined) await browserContext.close().catch(() => undefined);
  for (const child of childProcesses.reverse()) await stopChild(child);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
