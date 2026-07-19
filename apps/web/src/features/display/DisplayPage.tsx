import { useCallback, useEffect, useMemo, useState } from "react";
import { apiOrNull } from "../../api/client.js";
import type { Freshness } from "../../api/types.js";
import { usePolling } from "../../hooks/usePolling.js";

interface DisplayRow {
  region: string;
  event: string;
  group: string;
  participantName: string;
  score: string;
  rank: number;
}

interface DisplayData {
  snapshotId: string;
  lastSuccessAt: string;
  freshness: Freshness;
  rows: DisplayRow[];
}

const freshnessText: Record<Freshness, string> = {
  fresh: "数据新鲜",
  stale: "数据可能已过期",
  critical: "数据严重过期",
  empty: "等待数据",
};

function partitionKey(row: DisplayRow): string {
  return `${row.region}\u001f${row.event}\u001f${row.group}`;
}

export function DisplayPage() {
  const load = useCallback(() => apiOrNull<DisplayData>("/api/display"), []);
  const { data, error } = usePolling(load, 30_000);
  const [selectedKey, setSelectedKey] = useState("");
  const [autoRotate, setAutoRotate] = useState(true);
  const partitions = useMemo(() => {
    const values = new Map<string, { key: string; region: string; event: string; group: string }>();
    for (const row of data?.rows ?? []) {
      const key = partitionKey(row);
      if (!values.has(key)) values.set(key, { key, region: row.region, event: row.event, group: row.group });
    }
    return Array.from(values.values());
  }, [data]);
  const effectiveKey = partitions.some((partition) => partition.key === selectedKey) ? selectedKey : partitions[0]?.key ?? "";
  const rows = useMemo(() => (data?.rows ?? []).filter((row) => partitionKey(row) === effectiveKey), [data, effectiveKey]);
  const active = partitions.find((partition) => partition.key === effectiveKey);

  useEffect(() => {
    if (!autoRotate || partitions.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setSelectedKey((current) => {
        const index = Math.max(0, partitions.findIndex((partition) => partition.key === current));
        return partitions[(index + 1) % partitions.length]?.key ?? "";
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [autoRotate, partitions]);

  if (error !== null) return <div className="display-empty"><strong>无法连接本机成绩服务</strong><span>{error}</span></div>;
  if (data === null || data.rows.length === 0 || active === undefined) {
    return <div className="display-empty"><span className="display-logo">信</span><strong>等待首份成功排名</strong><span>请在管理后台配置赛项规则并完成手动导入</span></div>;
  }

  return (
    <main className={`display-board display-board--${data.freshness}`}>
      <header className="display-header">
        <div><p>信息素养大赛 · 成绩公示</p><h1 className="display-type">{active.event}</h1><div className="display-context"><span>{active.region}</span><span>{active.group}</span></div></div>
        <div className="display-freshness"><span className="display-dot" aria-hidden="true" /><strong>{freshnessText[data.freshness]}</strong><time className="data-type">{new Date(data.lastSuccessAt).toLocaleTimeString("zh-CN", { hour12: false })}</time></div>
      </header>
      {data.freshness === "fresh" ? null : <div className="display-warning" role="status">当前保留最近一次成功排名，请联系成绩管理员检查数据连接。</div>}
      <section className="display-ranking" aria-label={`${active.region}${active.event}${active.group}排名`}>
        <div className="display-table-head"><span>名次</span><span>选手</span><span>成绩</span></div>
        <div className="display-rows">{rows.slice(0, 12).map((row, index) => <div className="display-row" key={`${row.rank}-${row.participantName}-${index}`}><span className="display-rank data-type">{String(row.rank).padStart(2, "0")}</span><strong>{row.participantName}</strong><span className="display-score data-type">{row.score}</span></div>)}</div>
      </section>
      <footer className="display-footer">
        <label><input type="checkbox" checked={autoRotate} onChange={(change) => setAutoRotate(change.target.checked)} /> 自动轮播</label>
        <select aria-label="切换排名分区" value={effectiveKey} onChange={(change) => setSelectedKey(change.target.value)}>{partitions.map((partition) => <option key={partition.key} value={partition.key}>{partition.region} · {partition.event} · {partition.group}</option>)}</select>
        <span className="data-type">快照 {data.snapshotId.slice(0, 8)}</span>
      </footer>
    </main>
  );
}
