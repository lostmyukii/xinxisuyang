import type { RankingRow } from "../api/types.js";

export function RankingTable({ rows, compact = false }: { rows: readonly RankingRow[]; compact?: boolean }) {
  return (
    <div className="table-scroll">
      <table className={compact ? "ranking-table ranking-table--compact" : "ranking-table"}>
        <thead>
          <tr>
            <th scope="col">名次</th>
            <th scope="col">选手姓名</th>
            <th scope="col">成绩</th>
            {compact ? null : <th scope="col">赛区</th>}
            {compact ? null : <th scope="col">赛项</th>}
            {compact ? null : <th scope="col">组别</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sourceRecordId}>
              <td><span className={`rank-mark rank-mark--${Math.min(row.rank, 4)}`}>{row.rank}</span></td>
              <td>{row.participantName}</td>
              <td className="data-type score-cell">{row.score}</td>
              {compact ? null : <td>{row.region}</td>}
              {compact ? null : <td>{row.event}</td>}
              {compact ? null : <td>{row.group}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
