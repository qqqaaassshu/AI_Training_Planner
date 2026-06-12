interface ScoreSliderProps {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  hint?: string;
  minLabel?: string;
  maxLabel?: string;
}

export function ScoreSlider({ label, value, onChange, hint, minLabel = "低", maxLabel = "高" }: ScoreSliderProps) {
  const display = value ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", fontFamily: "'DM Mono', monospace" }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={display}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full"
        style={{ accentColor: "var(--primary)" }}
      />
      <div className="flex justify-between">
        <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{minLabel}</span>
        <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{maxLabel}</span>
      </div>
      {hint && (
        <p style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{hint}</p>
      )}
    </div>
  );
}
