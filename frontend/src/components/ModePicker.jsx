const modes = [
  { value: "balanced", label: "Balanced" },
  { value: "literal", label: "Literal" },
  { value: "natural", label: "Natural" },
];

export function ModePicker({ value, onChange, compact = false }) {
  return (
    <div className={`segmented${compact ? " segmented--compact" : ""}`}>
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          className={mode.value === value ? "active" : ""}
          onClick={() => onChange(mode.value)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
