import { useEffect, useState } from "react";
import { api, describeError } from "../../api/client.js";
import type { RankingIssue, RankingRow, SnapshotSummary } from "../../api/types.js";
import { EmptyState } from "../../components/EmptyState.js";
import { PageHeader } from "../../components/PageHeader.js";

interface SnapshotDetail {
  summary: SnapshotSummary;
  rows: RankingRow[];
  issues: RankingIssue[];
}

interface SnapshotComparison {
  base: SnapshotSummary;
  target: SnapshotSummary;
  summary: { added: number; removed: number; changed: number; unchanged: number; totalChanges: number };
  changes: Array<{
    type: "added" | "removed" | "changed";
    sourceRecordId: string;
    participantName: string;
    before: { score: string; rank: number | null; status: string } | null;
    after: { score: string; rank: number | null; status: string } | null;
  }>;
  truncated: boolean;
}

export function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparison | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    const value = await api<{ snapshots: SnapshotSummary[] }>("/api/snapshots");
    setSnapshots(value.snapshots);
  };
  useEffect(() => { void reload().catch((error) => setMessage(describeError(error, "无法读取历史快照。"))); }, []);

  const view = async (snapshot: SnapshotSummary) => {
    setComparison(null);
    setMessage("正在读取快照内容…");
    try {
      setDetail(await api<SnapshotDetail>(`/api/snapshots/${snapshot.id}`));
      setMessage(null);
    } catch (error) {
      setMessage(describeError(error, "无法读取该快照内容。"));
    }
  };

  const compareWithCurrent = async (snapshot: SnapshotSummary) => {
    const current = snapshots?.[0];
    if (current === undefined) return;
    setDetail(null);
    setMessage("正在比较历史快照…");
    try {
      setComparison(await api<SnapshotComparison>(`/api/snapshots/compare?base=${encodeURIComponent(snapshot.id)}&target=${encodeURIComponent(current.id)}`));
      setMessage(null);
    } catch (error) {
      setMessage(describeError(error, "无法比较这两个快照。"));
    }
  };

  const restore = async (snapshot: SnapshotSummary) => {
    if (!window.confirm(`确认恢复快照 ${snapshot.id.slice(0, 8)}？当前数据不会删除，之后仍可恢复。`)) return;
    setMessage("正在恢复历史快照…");
    try {
      await api(`/api/snapshots/${snapshot.id}/restore`, { method: "POST" });
      await reload();
      setDetail(null);
      setComparison(null);
      setMessage("历史快照已恢复为当前版本。");
    } catch (error) {
      setMessage(describeError(error, "恢复失败，当前成功快照未改变。"));
    }
  };

  return (
    <>
      <PageHeader eyebrow="成功版本不可变" title="历史快照" description="查看内容、与当前版本比较或恢复；非当前快照默认保留最近 30 天。" />
      {snapshots === null ? <div className="loading-line">正在读取快照…</div> : snapshots.length === 0 ? <EmptyState title="尚无历史快照" detail="完成首次手动导入后，成功版本会出现在这里。" /> : (
        <section className="timeline panel">{snapshots.map((snapshot, index) => <article key={snapshot.id} className={index === 0 ? "is-current" : undefined}><div className="timeline-dot" aria-hidden="true" /><div><div className="timeline-title"><strong>{index === 0 ? "当前成功快照" : "历史成功快照"}</strong><span className="data-type">{snapshot.id.slice(0, 8)}</span></div><p>{new Date(snapshot.createdAt).toLocaleString("zh-CN", { hour12: false })} · {snapshot.source === "manual" ? "手动导入" : snapshot.source} · {snapshot.fieldVersion}</p><div className="snapshot-counts"><span>{snapshot.recordCount} 条记录</span><span>{snapshot.validCount} 条有效</span><span>{snapshot.issueCount} 条异常</span></div><div className="snapshot-actions"><button className="button button--quiet" type="button" onClick={() => void view(snapshot)}>查看内容</button>{index === 0 ? null : <><button className="button button--quiet" type="button" onClick={() => void compareWithCurrent(snapshot)}>与当前比较</button><button className="button button--quiet" type="button" onClick={() => void restore(snapshot)}>恢复此快照</button></>}</div></div></article>)}</section>
      )}

      {detail === null ? null : <section className="panel snapshot-inspector" aria-label="快照内容"><div className="panel-heading"><div><p className="eyebrow">快照 {detail.summary.id.slice(0, 8)}</p><h2>快照内容</h2></div><button className="button button--quiet" type="button" onClick={() => setDetail(null)}>关闭</button></div><div className="snapshot-inspector-counts"><span>{detail.rows.length} 条有效排名</span><span>{detail.issues.length} 条异常</span></div><div className="table-scroll"><table className="ranking-table"><thead><tr><th>状态</th><th>赛区</th><th>赛项</th><th>组别</th><th>选手姓名</th><th>成绩</th><th>名次/原因</th></tr></thead><tbody>{detail.rows.slice(0, 100).map((row) => <tr key={`row-${row.sourceRecordId}`}><td>有效</td><td>{row.region}</td><td>{row.event}</td><td>{row.group}</td><td>{row.participantName}</td><td className="data-type">{row.score}</td><td className="data-type">{row.rank}</td></tr>)}{detail.issues.slice(0, 100).map((issue) => <tr key={`issue-${issue.sourceRecordId}`}><td>异常</td><td>{issue.region}</td><td>{issue.event}</td><td>{issue.group}</td><td>{issue.participantName}</td><td className="data-type">{issue.scoreRaw}</td><td>{issue.message}</td></tr>)}</tbody></table></div>{detail.rows.length + detail.issues.length > 200 ? <p className="snapshot-note">页面只显示前 200 条；导出仍使用完整快照。</p> : null}</section>}

      {comparison === null ? null : <section className="panel snapshot-inspector" aria-label="快照比较"><div className="panel-heading"><div><p className="eyebrow">{comparison.base.id.slice(0, 8)} → {comparison.target.id.slice(0, 8)}</p><h2>与当前快照比较</h2></div><button className="button button--quiet" type="button" onClick={() => setComparison(null)}>关闭</button></div><div className="comparison-counts"><div><strong className="data-type">{comparison.summary.added}</strong><span>新增</span></div><div><strong className="data-type">{comparison.summary.removed}</strong><span>移除</span></div><div><strong className="data-type">{comparison.summary.changed}</strong><span>变化</span></div><div><strong className="data-type">{comparison.summary.unchanged}</strong><span>未变</span></div></div>{comparison.changes.length === 0 ? <p className="snapshot-note">两个快照的排名与异常内容一致。</p> : <div className="table-scroll"><table className="ranking-table"><thead><tr><th>变化</th><th>选手姓名</th><th>原成绩/状态</th><th>当前成绩/状态</th></tr></thead><tbody>{comparison.changes.map((change) => <tr key={`${change.type}-${change.sourceRecordId}`}><td>{change.type === "added" ? "新增" : change.type === "removed" ? "移除" : "变化"}</td><td>{change.participantName || "—"}</td><td className="data-type">{change.before === null ? "—" : `${change.before.score} / ${change.before.rank ?? change.before.status}`}</td><td className="data-type">{change.after === null ? "—" : `${change.after.score} / ${change.after.rank ?? change.after.status}`}</td></tr>)}</tbody></table></div>}{comparison.truncated ? <p className="snapshot-note">变化超过 200 条，页面仅显示前 200 条。</p> : null}</section>}

      {message === null ? null : <p className="form-message" role="status">{message}</p>}
    </>
  );
}
