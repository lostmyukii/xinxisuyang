export interface Segment<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  value: T;
  segments: readonly Segment<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  segments,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="segmented-control" role="group" aria-label={ariaLabel}>
      {segments.map((segment) => (
        <button
          type="button"
          key={segment.value}
          className={segment.value === value ? "is-selected" : undefined}
          aria-pressed={segment.value === value}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
