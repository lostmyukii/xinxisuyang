import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputPath = fileURLToPath(new URL("./records.large.json", import.meta.url));
const familyNames = ["林", "陈", "周", "赵", "许", "沈", "韩", "蒋"];
const givenNames = ["晓雨", "子涵", "星宇", "明轩", "若溪", "嘉禾", "梓晴", "景行"];

const records = Array.from({ length: 5_000 }, (_, index) => ({
  赛区: ["东部赛区", "西部赛区", "南部赛区", "北部赛区"][index % 4],
  赛项: ["智能创作", "算法挑战", "数字艺术"][index % 3],
  组别: ["小学组", "初中组", "高中组"][index % 3],
  选手姓名: `${familyNames[index % familyNames.length]}${givenNames[(index * 3) % givenNames.length]}${index + 1}`,
  成绩: `${60 + (index % 41)}.${String(index % 100).padStart(2, "0")}`,
}));

await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
console.log(`已生成 ${records.length} 条合成记录：${outputPath}`);
