import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import type { SnapshotSummary } from "../../api/types.js";
import { EmptyState } from "../../components/EmptyState.js";
import { PageHeader } from "../../components/PageHeader.js";

export function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void api<{ snapshots: SnapshotSummary[] }>("/api/snapshots").then((value) => setSnapshots(value.snapshots)); }, []);
  const restore = async (snapshot: SnapshotSummary) => {
    if (!window.confirm(`确认恢复快照 ${snapshot.id.slice(0, 8)}？当前数据不会删除，之后仍可恢复。`)) return;
    setMessage("正在恢复历史快照…");
    try {
      await api(`/api/snapshots/${snapshot.id}/restore`, { method: "POST" });
      const response = await api<{ snapshots: SnapshotSummary[] }>("/api/snapshots");
      setSnapshots([snapshot, ...response.snapshots.filter((item) => item.id !== snapshot.id)]);
      setMessage("历史快照已恢复为当前版本。 ");
    } catch (error) {
      setMessage(`恢复失败：${error instanceof Error ? error.message : "UNKNOWN"}`);
    }
  };
  return (
    <>
      <PageHeader eyebrow="成功版本不可变" title="历史快照" description="内容不变不会重复建快照；失败导入不会覆盖最近成功版本。" />
      {snapshots === null ? <div className="loading-line">正在读取快照…</div> : snapshots.length === 0 ? <EmptyState title="尚无历史快照" detail="完成首次手动导入后，成功版本会出现在这里。" /> : (
        <section className="timeline panel">{snapshots.map((snapshot, index) => <article key={snapshot.id} className={index === 0 ? "is-current" : undefined}><div className="timeline-dot" aria-hidden="true" /><div><div className="timeline-title"><strong>{index === 0 ? "当前成功快照" : "历史成功快照"}</strong><span className="data-type">{snapshot.id.slice(0, 8)}</span></div><p>{new Date(snapshot.createdAt).toLocaleString("zh-CN", { hour12: false })} · {snapshot.source === "manual" ? "手动导入" : snapshot.source}</p><div className="snapshot-counts"><span>{snapshot.recordCount} 条记录</span><span>{snapshot.validCount} 条有效</span><span>{snapshot.issueCount} 条异常</span></div>{index === 0 ? null : <button className="button button--quiet snapshot-restore" type="button" onClick={() => void restore(snapshot)}>恢复此快照</button>}</div></article>)}</section>
      )}
      {message === null ? null : <p className="form-message" role="status">{message}</p>}
    </>
  );
}
