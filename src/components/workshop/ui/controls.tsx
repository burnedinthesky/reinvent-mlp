/* Shared controls (design-system §8). Selected-segment convention throughout:
   bg-accent text-accent-fg for the active choice, text-muted hover:text-fg
   for inactive. */

export interface SegOption<T extends string> {
    value: T;
    label: React.ReactNode;
    /** optional class-colored dot (category hue lives on the dot, not the pill) */
    dotClass?: string;
}

export function SegmentedControl<T extends string>({
    value,
    options,
    onChange,
    size = "md",
    mono = false,
    ariaLabel,
}: {
    value: T | null;
    options: SegOption<T>[];
    onChange: (v: T) => void;
    size?: "sm" | "md";
    mono?: boolean;
    ariaLabel?: string;
}) {
    const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-sm";
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            className="inline-flex rounded-md border border-border bg-panel p-0.5"
        >
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={`inline-flex items-center gap-1.5 rounded ${pad} ${
                        mono ? "font-mono tracking-wide uppercase" : ""
                    } transition-colors ${
                        o.value === value
                            ? "bg-accent font-semibold text-accent-fg"
                            : "text-muted hover:text-fg"
                    }`}
                >
                    {o.dotClass ? (
                        <span
                            className={`h-2 w-2 rounded-full ${o.dotClass}`}
                        />
                    ) : null}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function PrimaryButton({
    className = "",
    type = "button",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type={type}
            {...props}
            className={`inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-all hover:shadow-[0_0_10px] hover:shadow-accent/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${className}`}
        />
    );
}

export function GhostButton({
    bordered = false,
    className = "",
    type = "button",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { bordered?: boolean }) {
    return (
        <button
            type={type}
            {...props}
            className={`rounded-md px-2 py-1 text-sm text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 ${
                bordered ? "border border-border bg-panel" : ""
            } ${className}`}
        />
    );
}

export function Select({
    className = "",
    ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={`rounded-md border border-border bg-panel px-2 py-1 font-mono text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${className}`}
        />
    );
}
