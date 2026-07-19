import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { summarizeMemory, summarizeSampling } from "./stability-metrics.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const durationMinutes = Number(process.env.STABILITY_MINUTES ?? "240");
const intervalSeconds = Number(process.env.STABILITY_INTERVAL_SECONDS ?? "30");
const port = Number(process.env.STABILITY_PORT ?? "4328");
const reportPath = resolve(process.env.STABILITY_REPORT_PATH ?? join(projectRoot, "logs", "stability-report.json"));
if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("STABILITY_MINUTES_INVALID");
if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) throw new Error("STABILITY_INTERVAL_SECONDS_INVALID");
if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("STABILITY_PORT_INVALID");
if (process.env.STABILITY_WAKE_LOCK !== "1") throw new Error("STABILITY_WAKE_LOCK_REQUIRED");

const temporaryDirectory = await mkdtemp(join(tmpdir(), "xinxisuyang-stability-"));
const databasePath = join(temporaryDirectory, "stability.sqlite");
const baseUrl = `http://127.0.0.1:${port}`;
const key = Buffer.alloc(32, 19).toString("base64");
const startedAt = new Date();
const samples = [];
const transientEvents = [];
let transientRequestFailures = 0;
let child;
let runError;

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function request(path, init) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      if (!response.ok) throw new Error(`HTTP_${response.status}_${path}`);
      return response.json();
    } catch (error) {
      lastError = error;
      transientRequestFailures += 1;
      if (transientEvents.length < 100) {
        transientEvents.push({
          at: new Date().toISOString(),
          path,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message.replace(baseUrl, "LOCAL_API") : "UNKNOWN_REQUEST_ERROR",
        });
      }
      if (attempt < 2) await delay(100 * (attempt + 1));
    }
  }
  throw lastError;
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The local process is still starting.
    }
    await delay(500);
  }
  throw new Error("SERVER_HEALTH_TIMEOUT");
}

async function residentMemoryMb(pid) {
  const command = spawn("ps", ["-o", "rss=", "-p", String(pid)], { stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  for await (const chunk of command.stdout) output += chunk.toString();
  const exitCode = await new Promise((resolveExit) => command.once("close", resolveExit));
  if (exitCode !== 0) throw new Error("PROCESS_MEMORY_UNAVAILABLE");
  return Number(output.trim()) / 1024;
}

async function saveReport(report) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const summary = Object.fromEntries(
    Object.entries(report).filter(([key]) => key !== "samples" && key !== "transientEvents"),
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`稳定性报告已保存：${reportPath}`);
}

try {
  child = spawn("node", ["apps/server/dist/index.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      DATABASE_PATH: databasePath,
      COLUMN_KEY_BASE64: key,
      WEB_ORIGIN: "http://127.0.0.1:4173",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForHealth();
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
  const endAt = Date.now() + durationMinutes * 60_000;

  while (Date.now() < endAt) {
    const [status, rankings, display, snapshots] = await Promise.all([
      request("/api/status"),
      request("/api/rankings"),
      request("/api/display"),
      request("/api/snapshots"),
    ]);
    if (status.state !== "synced") throw new Error("STATUS_DRIFT");
    if (rankings.snapshot.id !== expectedSnapshotId || display.snapshotId !== expectedSnapshotId) {
      throw new Error("SNAPSHOT_DRIFT");
    }
    if (rankings.rows.length !== 501 || display.rows.length !== 501) throw new Error("ROW_COUNT_DRIFT");
    if (snapshots.snapshots.length !== 1) throw new Error("DUPLICATE_SNAPSHOT");
    samples.push({
      at: new Date().toISOString(),
      rssMb: await residentMemoryMb(child.pid),
      snapshotId: expectedSnapshotId,
      rowCount: rankings.rows.length,
    });
    await delay(Math.min(intervalSeconds * 1000, Math.max(0, endAt - Date.now())));
  }

  const sampling = summarizeSampling(samples, durationMinutes, intervalSeconds);
  const memory = summarizeMemory(samples, startedAt.toISOString(), durationMinutes, (sample) => sample.rssMb);
  if (sampling.sampleCount < sampling.expectedMinimumSamples) {
    throw new Error(`SAMPLE_COVERAGE_${sampling.sampleCount}_OF_${sampling.expectedMinimumSamples}`);
  }
  if (sampling.maxGapSeconds > sampling.maxAllowedGapSeconds) {
    throw new Error(`SAMPLE_GAP_${sampling.maxGapSeconds.toFixed(2)}S`);
  }
  if (memory.sustainedGrowthMb > 128 || memory.peakWindowGrowthMb > 128) {
    throw new Error(`MEMORY_SUSTAINED_GROWTH_${Math.max(memory.sustainedGrowthMb, memory.peakWindowGrowthMb).toFixed(2)}MB`);
  }
  if (transientRequestFailures > 3) throw new Error(`TRANSIENT_FAILURES_${transientRequestFailures}`);
  const report = {
    result: "passed",
    mode: "manual-only",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMinutes,
    intervalSeconds,
    wakeLock: "caffeinate-ims",
    sampleCount: samples.length,
    snapshotCount: 1,
    rowCount: 501,
    transientRequestFailures,
    sampling,
    memory,
    transientEvents,
    samples,
  };
  await saveReport(report);
} catch (error) {
  runError = error instanceof Error ? error.message : "UNKNOWN_STABILITY_ERROR";
  const sampling = samples.length === 0 ? null : summarizeSampling(samples, durationMinutes, intervalSeconds);
  const memory = samples.length < 2
    ? null
    : summarizeMemory(samples, startedAt.toISOString(), durationMinutes, (sample) => sample.rssMb);
  await saveReport({
    result: "failed",
    mode: "manual-only",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMinutes,
    intervalSeconds,
    wakeLock: "caffeinate-ims",
    transientRequestFailures,
    error: runError,
    sampling,
    memory,
    transientEvents,
    samples,
  });
  throw error;
} finally {
  if (child !== undefined && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      delay(5_000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}
