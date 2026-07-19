import { useEffect, useMemo, useState } from "react";
import { apiOrNull, describeError } from "../../api/client.js";
import type { RankingIssue, SnapshotSummary } from "../../api/types.js";
import { EmptyState } from "../../components/EmptyState.js";
import { PageHeader } from "../../components/PageHeader.js";

export function IssuesPage() {
  const [issues, setIssues] = useState<RankingIssue[] | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void apiOrNull<{ snapshot: SnapshotSummary; issues: RankingIssue[] }>("/api/issues")
      .then((value) => {
        setIssues(value?.issues ?? []);
        setSnapshot(value?.snapshot ?? null);
      })
      .catch((error) => {
        setIssues([]);
        setMessage(describeError(error, "无法读取异常记录，请确认本机服务仍在运行。"));
      });
  }, []);
  const grouped = useMemo(() => {
    const values = new Map<string, number>();
    for (const issue of issues ?? []) values.set(issue.message, (values.get(issue.message) ?? 0) + 1);
    return Array.from(values.entries());
  }, [issues]);

  return (
    <>
      <PageHeader eyebrow="只报告，不修正" title="异常记录" description="异常成绩不会参与排名；请回到裁判表格核对来源记录。" />
      {issues === null ? <div className="loading-line">正在读取异常列表…</div> : issues.length === 0 ? (
        <EmptyState title="当前没有异常记录" detail={snapshot === null ? "尚无成功快照。" : "当前成功快照中的成绩均通过规则校验。"} />
      ) : (
        <>
          <div className="issue-groups">{grouped.map(([message, count]) => <div key={message}><strong className="data-type">{count}</strong><span>{message}</span></div>)}</div>
          <section className="panel table-scroll">
            <table className="ranking-table issue-table"><thead><tr><th>来源行</th><th>赛区</th><th>赛项</th><th>组别</th><th>选手姓名</th><th>原始成绩</th><th>原因</th></tr></thead>
              <tbody>{issues.map((issue) => <tr key={issue.sourceRecordId}><td className="data-type">{issue.sourceIndex + 2}</td><td>{issue.region}</td><td>{issue.event}</td><td>{issue.group}</td><td>{issue.participantName || "—"}</td><td className="data-type">{issue.scoreRaw || "（空）"}</td><td><span className="error-reason">{issue.message}</span></td></tr>)}</tbody>
            </table>
          </section>
        </>
      )}
      {message === null ? null : <p className="form-message" role="status">{message}</p>}
    </>
  );
}
