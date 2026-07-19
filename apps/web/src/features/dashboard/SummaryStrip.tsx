export function SummaryStrip({ records, valid, issues }: { records: number; valid: number; issues: number }) {
  return (
    <div className="summary-strip" aria-label="当前数据概览">
      <div><span>参赛记录</span><strong className="data-type">{records}</strong></div>
      <div><span>有效成绩</span><strong className="data-type">{valid}</strong></div>
      <div><span>需要处理</span><strong className="data-type summary-alert">{issues}</strong></div>
      <div><span>有效率</span><strong className="data-type">{records === 0 ? "—" : `${Math.round((valid / records) * 100)}%`}</strong></div>
    </div>
  );
}
