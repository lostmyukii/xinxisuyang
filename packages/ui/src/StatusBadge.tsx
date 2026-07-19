import type { ReactNode } from "react";

export type StatusTone = "green" | "orange" | "red" | "blue" | "neutral";

export interface StatusBadgeProps {
  children: ReactNode;
  icon: string;
  tone: StatusTone;
}

export function StatusBadge({ children, icon, tone }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span aria-hidden="true">{icon}</span>
      {children}
    </span>
  );
}
