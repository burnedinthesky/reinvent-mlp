/* Floating-island surfaces (design-system §5, §7.1): hairline-bordered panels,
   the bottom-center control dock, stat readouts, hint/stub cards. */

import { useRef, useState } from "react";

import { MicroLabel } from "./typography";

export function Island({
    className = "",
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={`rounded-[18px] border border-border bg-panel shadow-lg ${className}`}
        >
            {children}
        </div>
    );
}

/** Bottom-center control dock (§7.1). Children are control groups; separate
    them with <DockDivider />. Grab the grip at the top to reposition it when it
    covers the data or axis labels (Figma-style floating toolbar). */
export function Dock({ children }: { children: React.ReactNode }) {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const drag = useRef<{
        px: number;
        py: number;
        ox: number;
        oy: number;
    } | null>(null);

    const onGripDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = {
            px: e.clientX,
            py: e.clientY,
            ox: offset.x,
            oy: offset.y,
        };
        const move = (me: PointerEvent) => {
            const d = drag.current;
            if (!d) return;
            setOffset({
                x: d.ox + (me.clientX - d.px),
                y: d.oy + (me.clientY - d.py),
            });
        };
        const up = () => {
            drag.current = null;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex justify-center">
            <div
                className="pointer-events-auto flex flex-col rounded-[18px] border border-border bg-panel shadow-lg"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            >
                <button
                    type="button"
                    aria-label="拖曳工具列，點兩下重設位置"
                    onPointerDown={onGripDown}
                    onDoubleClick={() => setOffset({ x: 0, y: 0 })}
                    className="flex touch-none cursor-grab items-center justify-center rounded-t-[18px] py-1.5 transition-colors hover:bg-border/30 active:cursor-grabbing"
                >
                    <span className="h-1 w-8 rounded-full bg-border" />
                </button>
                <div className="flex items-center gap-4 px-3 pt-1 pb-3">
                    {children}
                </div>
            </div>
        </div>
    );
}

export function DockDivider() {
    return <div className="w-px self-stretch bg-border" />;
}

export function StatCard({
    label,
    value,
    accent = false,
    className = "",
    children,
}: {
    label: React.ReactNode;
    value: React.ReactNode;
    accent?: boolean;
    className?: string;
    children?: React.ReactNode;
}) {
    return (
        <Island className={`px-4 py-3 ${className}`}>
            <MicroLabel accent={accent}>{label}</MicroLabel>
            <div className="mt-0.5 font-mono text-3xl font-semibold text-fg">
                {value}
            </div>
            {children}
        </Island>
    );
}

/** Dashed-border "not-yet" card for empty states (§5). */
export function HintCard({
    title,
    children,
    className = "",
}: {
    title: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`max-w-sm rounded-md border border-dashed border-border bg-panel px-7 py-5 text-center ${className}`}
        >
            <div className="font-display text-base font-semibold text-fg">
                {title}
            </div>
            <div className="mt-1.5 text-xs leading-relaxed text-muted">
                {children}
            </div>
        </div>
    );
}

export function PillChip({
    className = "",
    interactive = false,
    children,
}: {
    className?: string;
    interactive?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div
            className={`${interactive ? "" : "pointer-events-none "}rounded-full border border-border bg-panel px-3.5 py-1.5 font-mono text-[11px] text-muted ${className}`}
        >
            {children}
        </div>
    );
}
