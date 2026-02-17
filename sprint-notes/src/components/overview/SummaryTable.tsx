import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import { TEAM_MEMBERS } from '../../config/team';
import { calculateEngineerMetrics } from '../../stores/historyStore';
import './SummaryTable.css';

export function SummaryTable() {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const getEngineerTimeOff = useNotesStore((state) => state.getEngineerTimeOff);

  if (!currentSprint) {
    return <div className="summary-table__empty">No sprint data loaded</div>;
  }

  // Calculate metrics for each team member
  const data = TEAM_MEMBERS.map((member) => {
    const metrics = calculateEngineerMetrics(member.id, currentSprint.tickets);
    const timeOff = getEngineerTimeOff(currentSprint.id, member.id);
    const totalPts = metrics.devPts + metrics.reviewPts;
    const ptsPerDay = timeOff.workingDays > 0
      ? (totalPts / timeOff.workingDays).toFixed(1)
      : '-';
    return {
      member,
      metrics,
      totalPts,
      ptoDays: timeOff.ptoDays,
      ptsPerDay,
    };
  });

  // Calculate team totals
  const totals = data.reduce(
    (acc, row) => ({
      devCount: acc.devCount + row.metrics.devCount,
      reviewCount: acc.reviewCount + row.metrics.reviewCount,
      devPts: acc.devPts + row.metrics.devPts,
      reviewPts: acc.reviewPts + row.metrics.reviewPts,
      itCount: acc.itCount + row.metrics.itCount,
      totalPts: acc.totalPts + row.totalPts,
    }),
    { devCount: 0, reviewCount: 0, devPts: 0, reviewPts: 0, itCount: 0, totalPts: 0 }
  );

  return (
    <div className="summary-table-wrapper">
      <table className="summary-table">
        <thead>
          <tr>
            <th>Engineer</th>
            <th>PTO</th>
            <th>Dev #</th>
            <th className="summary-table__th--dev">Dev Pts</th>
            <th>Review #</th>
            <th className="summary-table__th--review">Review Pts</th>
            <th>IT #</th>
            <th className="summary-table__th--muted">Total Pts</th>
            <th>Pts/Day</th>
          </tr>
        </thead>
        <tbody>
          {data.map(({ member, metrics, totalPts, ptoDays, ptsPerDay }) => (
            <tr key={member.id}>
              <td className="summary-table__name">
                {member.avatarUrl && (
                  <img
                    src={member.avatarUrl}
                    alt=""
                    className="summary-table__avatar"
                  />
                )}
                {member.name}
              </td>
              <td className="summary-table__pto">
                {ptoDays > 0 ? (
                  <span className="summary-table__pto-badge">{ptoDays}d</span>
                ) : (
                  '-'
                )}
              </td>
              <td>{metrics.devCount}</td>
              <td className="summary-table__dev-pts">{metrics.devPts}</td>
              <td>{metrics.reviewCount}</td>
              <td className="summary-table__review-pts">{metrics.reviewPts}</td>
              <td>{metrics.itCount}</td>
              <td className="summary-table__total-muted">{totalPts}</td>
              <td className="summary-table__pts-day">{ptsPerDay}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="summary-table__name">
              <strong>Team Total</strong>
            </td>
            <td>-</td>
            <td><strong>{totals.devCount}</strong></td>
            <td className="summary-table__dev-pts"><strong>{totals.devPts}</strong></td>
            <td><strong>{totals.reviewCount}</strong></td>
            <td className="summary-table__review-pts"><strong>{totals.reviewPts}</strong></td>
            <td><strong>{totals.itCount}</strong></td>
            <td className="summary-table__total-muted"><strong>{totals.totalPts}</strong></td>
            <td>-</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
