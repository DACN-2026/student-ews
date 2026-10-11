type Props = { id: string; label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; unit: string; error?: string };

export default function WarningNumberField({ id, label, value, onChange, min, max, step = 1, unit, error }: Props) {
  return <div className="min-w-0">
    <label htmlFor={id} className="block text-xs font-medium text-slate-700">{label}<span className="sr-only"> ({unit})</span></label>
    <div className="relative mt-2">
      <input id={id} type="number" inputMode={step < 1 ? "decimal" : "numeric"} required min={min} max={max} step={step}
        value={Number.isFinite(value) ? value : ""} onChange={event => onChange(event.currentTarget.valueAsNumber)}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        className={`min-h-11 w-full rounded-lg border bg-white py-2.5 pl-3 pr-20 text-sm font-semibold tabular-nums text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-lime-700/25 disabled:bg-slate-50 ${error ? "border-red-400 focus:border-red-500" : "border-slate-300 hover:border-slate-400 focus:border-lime-700"}`} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500" aria-hidden="true">{unit}</span>
    </div>
    {error && <p id={`${id}-error`} className="mt-1.5 text-xs leading-5 text-red-700">{error}</p>}
  </div>;
}
