/* The editorial micro-label idiom (design-system §4) and keyboard chips. */

export function MicroLabel({
    accent = false,
    className = "",
    children,
}: {
    accent?: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <span
            className={`font-mono text-[10px] uppercase tracking-wide ${
                accent ? "text-accent" : "text-muted"
            } ${className}`}
        >
            {children}
        </span>
    );
}

export function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-bg px-1 font-mono text-[10px] uppercase text-muted">
            {children}
        </kbd>
    );
}
