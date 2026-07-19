# 合成测试数据

本目录只保存完全虚构的结构等价数据，不允许替换为金山文档中的真实姓名、联系方式、身份证号或成绩。

- `records.valid.json`：整数、一位小数、两位小数和同分样例。
- `records.invalid.json`：空值、文本、三位小数和越界样例。
- `generate-large.ts`：生成 5,000 条性能测试数据；生成物 `records.large.json` 也必须保持为合成数据。
