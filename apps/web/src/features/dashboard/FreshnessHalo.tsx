import { StatusBadge } from "@xinxisuyang/ui";
import type { Freshness } from "../../api/types.js";

const states: Record<Freshness, { label: string; detail: string; icon: string; tone: "green" | "orange" | "red" | "neutral" }> = {
  fresh: { label: "数据新鲜", detail: "最近两分钟内已成功更新", icon: "✓", tone: "green" },
  stale: { label: "可能已过期", detail: "超过两分钟未成功更新", icon: "!", tone: "orange" },
  critical: { label: "严重过期", detail: "超过五分钟未成功更新", icon: "×", tone: "red" },
  empty: { label: "等待首份数据", detail: "请配置赛项规则并完成手动导入", icon: "·", tone: "neutral" },
};

export function FreshnessHalo({ freshness, lastSuccessAt }: { freshness: Freshness; lastSuccessAt: string | null }) {
  const state = states[freshness];
  return (
    <section className={`freshness-halo freshness-halo--${freshness}`} aria-label={`数据状态：${state.label}`}>
      <div className="halo-orbit" aria-hidden="true" />
      <div className="halo-core">
        <StatusBadge tone={state.tone} icon={state.icon}>{state.label}</StatusBadge>
        <strong className="display-type">排名可信度</strong>
        <p>{state.detail}</p>
        <span className="data-type">
          {lastSuccessAt === null ? "尚无成功快照" : `最后成功 ${new Date(lastSuccessAt).toLocaleString("zh-CN", { hour12: false })}`}
        </span>
      </div>
    </section>
  );
}
