export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: { href: string; label: string } }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">◇</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action === undefined ? null : <a className="button button--primary" href={action.href}>{action.label}</a>}
    </div>
  );
}
