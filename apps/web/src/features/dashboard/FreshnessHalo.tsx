import { StatusBadge } from "@xinxisuyang/ui";
import { describeError } from "../../api/client.js";
import type { Freshness, FreshnessSettings } from "../../api/types.js";

const states: Record<Freshness, { label: string; icon: string; tone: "green" | "orange" | "red" | "neutral" }> = {
  fresh: { label: "数据新鲜", icon: "✓", tone: "green" },
  stale: { label: "可能已过期", icon: "!", tone: "orange" },
  critical: { label: "严重过期", icon: "×", tone: "red" },
  empty: { label: "等待首份数据", icon: "·", tone: "neutral" },
};

export function FreshnessHalo({ freshness, lastSuccessAt, lastErrorCode, settings }: { freshness: Freshness; lastSuccessAt: string | null; lastErrorCode: string | null; settings: FreshnessSettings }) {
  const state = states[freshness];
  const detail = freshness === "fresh"
    ? `最近 ${settings.staleAfterSeconds} 秒内已成功校验`
    : freshness === "stale"
      ? `超过 ${settings.staleAfterSeconds} 秒未成功校验`
      : freshness === "critical"
        ? `超过 ${settings.criticalAfterSeconds} 秒未成功校验`
        : "请配置赛项规则并完成手动导入";
  return (
    <section className={`freshness-halo freshness-halo--${freshness}`} aria-label={`数据状态：${state.label}`}>
      <div className="halo-orbit" aria-hidden="true" />
      <div className="halo-core">
        <StatusBadge tone={state.tone} icon={state.icon}>{state.label}</StatusBadge>
        <strong className="display-type">排名可信度</strong>
        <p>{detail}</p>
        <span className="data-type">
          {lastSuccessAt === null ? "尚无成功快照" : `最后成功 ${new Date(lastSuccessAt).toLocaleString("zh-CN", { hour12: false })}`}
        </span>
      </div>
      <details className="halo-details">
        <summary>查看状态详情</summary>
        <div>
          <p>{lastSuccessAt === null ? "尚无成功校验" : `最后成功：${new Date(lastSuccessAt).toLocaleString("zh-CN", { hour12: false })}`}</p>
          <p>{lastErrorCode === null ? "最近一次发布没有错误" : `最近错误：${describeError(new Error(lastErrorCode), lastErrorCode)}`}</p>
        </div>
      </details>
    </section>
  );
}
