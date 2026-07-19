import { expect, test } from "@playwright/test";

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

test("display receives masked names and keeps freshness visible", async ({ page }) => {
  await page.goto("/display");
  await expect(page.getByRole("heading", { name: "智能创作" })).toBeVisible();
  await expect(page.getByText("林*雨", { exact: true })).toBeVisible();
  await expect(page.getByText("林晓雨", { exact: true })).toHaveCount(0);
  await expect(page.getByText("数据新鲜", { exact: true })).toBeVisible();
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
