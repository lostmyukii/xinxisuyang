import { useCallback } from "react";
import { StatusBadge } from "@xinxisuyang/ui";
import { api, apiOrNull } from "../../api/client.js";
import type { RankingRow, SnapshotSummary, StatusResponse } from "../../api/types.js";
import { EmptyState } from "../../components/EmptyState.js";
import { PageHeader } from "../../components/PageHeader.js";
import { RankingTable } from "../../components/RankingTable.js";
import { usePolling } from "../../hooks/usePolling.js";
import { FreshnessHalo } from "./FreshnessHalo.js";
import { SummaryStrip } from "./SummaryStrip.js";

interface DashboardData {
  status: StatusResponse;
  rankings: { snapshot: SnapshotSummary; rows: RankingRow[] } | null;
}

export function DashboardPage() {
  const load = useCallback(async (): Promise<DashboardData> => {
    const [status, rankings] = await Promise.all([
      api<StatusResponse>("/api/status"),
      apiOrNull<{ snapshot: SnapshotSummary; rows: RankingRow[] }>("/api/rankings"),
    ]);
    return { status, rankings };
  }, []);
  const { data, error, loading, refresh } = usePolling(load, 30_000);

  return (
    <>
      <PageHeader
        eyebrow="现场总览"
        title="赛事指挥台"
        description="先确认数据是否可信，再处理异常，最后查看排名。"
        actions={<button className="button button--primary" type="button" onClick={() => void refresh()}>刷新本机数据</button>}
      />
      {error === null ? null : <div className="inline-alert inline-alert--red">无法连接本机服务：{error}</div>}
      {loading || data === null ? <div className="loading-line">正在读取本机快照…</div> : (
        <div className="dashboard-grid">
          <FreshnessHalo freshness={data.status.freshness} lastSuccessAt={data.status.lastSuccessAt} />
          <section className="collection-boundary">
            <StatusBadge tone="orange" icon="!">自动采集未验证</StatusBadge>
            <h2>当前使用手动导入</h2>
            <p>{data.status.collectionMessage}</p>
            <a href="/import">导入新成绩 <span aria-hidden="true">→</span></a>
          </section>
          <SummaryStrip {...data.status.counts} />
          <section className="panel ranking-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">最近成功快照</p><h2>最新排名</h2></div>
              <a href="/rankings">查看全部</a>
            </div>
            {data.rankings === null || data.rankings.rows.length === 0 ? (
              <EmptyState title="还没有可显示的排名" detail="配置赛项分数范围后，导入裁判表格数据即可生成排名。" action={{ href: "/rules", label: "配置赛项规则" }} />
            ) : <RankingTable rows={data.rankings.rows.slice(0, 8)} compact />}
          </section>
          <section className="panel issue-callout">
            <div className="issue-count data-type">{data.status.counts.issues}</div>
            <p className="eyebrow">需要处理</p>
            <h2>{data.status.counts.issues === 0 ? "当前没有异常成绩" : "异常记录不会参与排名"}</h2>
            <p>{data.status.counts.issues === 0 ? "所有已导入记录均通过当前赛项规则。" : "查看具体原因，但不要在本系统修改裁判原始成绩。"}</p>
            <a className="button button--quiet" href="/issues">查看异常记录</a>
          </section>
        </div>
      )}
    </>
  );
}
