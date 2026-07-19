import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const apiBase = "http://127.0.0.1:4319";
const text = [
  "赛区\t赛项\t组别\t选手姓名\t成绩",
  "东部赛区\t智能创作\t小学组\t林晓雨\t98",
  "东部赛区\t智能创作\t小学组\t陈子涵\t96.8",
  "东部赛区\t智能创作\t小学组\t周星宇\t96.80",
  "东部赛区\t智能创作\t小学组\t赵明轩\t93.1",
  "东部赛区\t智能创作\t小学组\t许若溪\t异常",
].join("\n");
const mapping = {
  region: "赛区",
  event: "赛项",
  group: "组别",
  participantName: "选手姓名",
  scoreRaw: "成绩",
};

test.beforeEach(async ({ request }) => {
  const rulesResponse = await request.put(`${apiBase}/api/event-rules`, {
    data: { rules: [{ event: "智能创作", minScore: "0", maxScore: "120", enabled: true }] },
  });
  expect(rulesResponse.ok()).toBeTruthy();
  const candidate = { format: "clipboard", text, mapping };
  const previewResponse = await request.post(`${apiBase}/api/import/preview`, { data: candidate });
  const preview = await previewResponse.json() as { hash: string };
  const publishResponse = await request.post(`${apiBase}/api/import/publish`, {
    data: { ...candidate, expectedHash: preview.hash },
  });
  expect(publishResponse.ok()).toBeTruthy();
});

test("management console shows trusted ranking, tie jumps, and issues", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "赛事指挥台" })).toBeVisible();
  await expect(page.getByText("排名可信度")).toBeVisible();
  await expect(page.getByText("自动采集未验证")).toBeVisible();
  await expect(page.getByText("5", { exact: true })).toBeVisible();

  await page.goto("/rankings");
  const ranks = await page.locator("tbody .rank-mark").allTextContents();
  expect(ranks).toEqual(["1", "2", "2", "4"]);
  await expect(page.getByText("96.80", { exact: true })).toBeVisible();

  await page.goto("/issues");
  await expect(page.getByRole("table").getByText("成绩不是有效数字", { exact: true })).toBeVisible();
});

test("display receives masked names and keeps freshness visible", async ({ page, request }) => {
  const displayResponse = await request.get(`${apiBase}/api/display`);
  expect(displayResponse.ok()).toBeTruthy();
  const display = await displayResponse.json() as { snapshotId: string };
  await page.goto("/display");
  await expect(page.getByRole("heading", { name: "智能创作" })).toBeVisible();
  await expect(page.getByText("林*雨", { exact: true })).toBeVisible();
  await expect(page.getByText("林晓雨", { exact: true })).toHaveCount(0);
  await expect(page.getByText("数据新鲜", { exact: true })).toBeVisible();
  await expect(page.locator(".display-snapshot-id")).toContainText(display.snapshotId.slice(0, 8));
});

test("display paginates rankings that exceed one 16:9 screen", async ({ page, request }) => {
  const manyRows = Array.from({ length: 13 }, (_, index) =>
    `东部赛区\t智能创作\t小学组\t分页选手${index + 1}\t${100 - index}`,
  );
  const candidate = {
    format: "clipboard",
    text: ["赛区\t赛项\t组别\t选手姓名\t成绩", ...manyRows].join("\n"),
    mapping,
  };
  const previewResponse = await request.post(`${apiBase}/api/import/preview`, { data: candidate });
  const preview = await previewResponse.json() as { hash: string };
  const publishResponse = await request.post(`${apiBase}/api/import/publish`, {
    data: { ...candidate, expectedHash: preview.hash },
  });
  expect(publishResponse.ok()).toBeTruthy();

  await page.goto("/display");
  await page.getByLabel("自动轮播").uncheck();
  await expect(page.locator(".display-row")).toHaveCount(12);
  await expect(page.getByText("第 1/2 页", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.locator(".display-row")).toHaveCount(1);
  await expect(page.getByText("第 2/2 页", { exact: true })).toBeVisible();
});

test("manual import UI previews and publishes a candidate snapshot", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel("粘贴从金山表格复制的内容").fill(text);
  await page.getByRole("button", { name: "生成导入预览" }).click();
  await expect(page.getByText("预览完成。确认数量、赛项配置和异常后再发布。")).toBeVisible();
  await expect(page.getByText("候选快照")).toBeVisible();
  await page.getByRole("button", { name: "发布为当前快照" }).click();
  await expect(page.getByText("快照已发布。排名、大屏和导出已切换到本次成功数据。")).toBeVisible();
});

test("group export downloads a traceable workbook", async ({ page }) => {
  await page.goto("/exports");
  await page.getByLabel("赛区").selectOption("东部赛区");
  await page.getByLabel("赛项").selectOption("智能创作");
  await page.getByLabel("组别").selectOption("小学组");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "生成并下载文件" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/信息素养大赛_东部赛区_智能创作_小学组_成绩排名_.*\.xlsx/u);
  await expect(page.getByText("导出文件已生成，内容对应当前成功快照。")).toBeVisible();
});

test("primary navigation exposes a visible keyboard focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).not.toHaveJSProperty("tagName", "BODY");
  const boxShadow = await focused.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(boxShadow).not.toBe("none");
});

test("sync management persists freshness settings and shows publication audit", async ({ page }) => {
  await page.goto("/sync");
  await expect(page.getByRole("heading", { name: "同步管理" })).toBeVisible();
  await expect(page.getByText(/自动采集未验证/u)).toBeVisible();
  await page.getByLabel("可能过期（秒）").fill("180");
  await page.getByLabel("严重过期（秒）").fill("600");
  await page.getByRole("button", { name: "保存新鲜度设置" }).click();
  await expect(page.getByText("新鲜度阈值已保存到本机数据库。")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("可能过期（秒）")).toHaveValue("180");
  await expect(page.getByLabel("严重过期（秒）")).toHaveValue("600");
  await expect(page.getByRole("table").getByText("手动导入", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("table").getByText(/成功/u).first()).toBeVisible();
});

test("history page views and compares immutable snapshots", async ({ page, request }) => {
  const baselineResponse = await request.get(`${apiBase}/api/rankings`);
  expect(baselineResponse.ok()).toBeTruthy();
  const baseline = await baselineResponse.json() as { snapshot: { id: string } };
  const changedText = text.replace("林晓雨\t98", "林晓雨\t99");
  const candidate = { format: "clipboard", text: changedText, mapping };
  const previewResponse = await request.post(`${apiBase}/api/import/preview`, { data: candidate });
  const preview = await previewResponse.json() as { hash: string };
  const publishResponse = await request.post(`${apiBase}/api/import/publish`, {
    data: { ...candidate, expectedHash: preview.hash },
  });
  expect(publishResponse.ok()).toBeTruthy();

  await page.goto("/snapshots");
  const historical = page.locator(".timeline article").filter({ hasText: baseline.snapshot.id.slice(0, 8) });
  await expect(historical).toBeVisible();
  await historical.getByRole("button", { name: "查看内容" }).click();
  await expect(page.getByRole("heading", { name: "快照内容" })).toBeVisible();
  await expect(page.getByRole("table").getByText("林晓雨", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await historical.getByRole("button", { name: "与当前比较" }).click();
  await expect(page.getByRole("heading", { name: "与当前快照比较" })).toBeVisible();
  await expect(page.locator(".comparison-counts > div").filter({ hasText: "变化" }).getByText("1", { exact: true })).toBeVisible();
});

test("admin and display pass automated WCAG AA checks", async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of ["/", "/rankings", "/issues", "/rules", "/import", "/sync", "/snapshots", "/exports", "/display"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const summary = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    }));
    expect(summary, `${path} accessibility violations`).toEqual([]);
  }
});

test("narrow admin and 16:9 display remain usable with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "赛事指挥台" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const animationDuration = await page.locator(".halo-orbit").evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration)).toBeLessThanOrEqual(0.001);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/display");
  await expect(page.getByRole("heading", { name: "智能创作" })).toBeVisible();
  await expect(page.locator(".display-row")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
