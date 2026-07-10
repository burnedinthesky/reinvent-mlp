/* Admin-only controls that aren't in the shared workshop ui/ kit yet: an
   accessible Toggle switch, a LabeledSlider, and a WarnBanner. Same design-system
   recipes (§8) and token classes as the rest of the app; kept local so the admin
   console stays decoupled while the shared kit is edited elsewhere. */

/** Accessible switch (design-system §8): track h-6 w-11, knob h-5 w-5. */
export function Toggle({
    checked,
    onChange,
    label,
    ariaLabel,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label?: React.ReactNode;
    ariaLabel?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            onClick={() => onChange(!checked)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                checked ? "bg-accent" : "bg-border"
            }`}
        >
            <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    checked ? "translate-x-5" : "translate-x-0"
                }`}
            />
            {label ? <span className="sr-only">{label}</span> : null}
        </button>
    );
}

/** Range + label + live mono readout (design-system §8 LabeledSlider). */
export function LabeledSlider({
    label,
    value,
    min,
    max,
    step = 1,
    onChange,
    format,
}: {
    label: React.ReactNode;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
    format?: (v: number) => string;
}) {
    return (
        <div>
            <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-medium text-fg">{label}</span>
                <span className="font-mono text-xs text-muted">
                    {format ? format(value) : value}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-accent"
            />
        </div>
    );
}

/** Caution banner (warning token) — used for the import balance WARN (§4.1). */
export function WarnBanner({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
            <span aria-hidden className="mt-px font-mono text-xs">
                ⚠
            </span>
            <div className="leading-relaxed">{children}</div>
        </div>
    );
}

/** A small pass/fail dot + label, for verification rows. */
export function Verdict({ pass }: { pass: boolean }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase ${
                pass ? "text-positive" : "text-warning"
            }`}
        >
            <span
                className={`h-2 w-2 rounded-full ${pass ? "bg-positive" : "bg-warning"}`}
            />
            {pass ? "pass" : "tune"}
        </span>
    );
}
