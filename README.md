# 信息素养大赛成绩核对系统

本项目是在比赛管理 Mac 上运行的本地成绩核对系统。裁判继续填写金山文档；系统负责只读导入、按“赛区＋赛项＋组别”排名、脱敏大屏和 Excel 导出。

自动采集当前仍受真实 Chrome Go/No-Go 验证门控制。在验证完成前，正式可用入口是复制粘贴、CSV 或 XLSX 手动导入。

## 环境

- Node.js 24 或更高版本
- pnpm 11 或更高版本
- Google Chrome（自动采集探针使用）

## 开发命令

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm dev
```

## 比赛电脑运行

```bash
pnpm check:environment
pnpm package:local
pnpm start:local
```

正式验收还提供 `pnpm test:stability` 和 `pnpm test:stability:ui`，默认各运行 240 分钟；短时冒烟不能替代这两项正式稳定性测试。

浏览器打开 `http://127.0.0.1:4173`。当前正式数据入口是手动粘贴、CSV 或 XLSX；Chrome 扩展只用于只读结构探测，不能视为自动同步已经启用。

详细业务与安全规则见 [开发文档.md](./开发文档.md)，执行顺序见 [实施计划.md](./实施计划.md)，现场操作见 [docs/安装与现场运行.md](./docs/安装与现场运行.md)。
