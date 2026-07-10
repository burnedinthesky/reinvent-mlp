/* Custom activation picker for the P6 playground: three selectable cells, each
   drawing its function curve over z∈[-3,3] so the choice reads visually instead
   of as an opaque dropdown value. Follows the selected-segment convention
   (accent border/fill for the active choice). */

import { useCanvas } from "#/components/workshop/canvas/useCanvas";
import { C, FONT_MONO, rgbCss } from "#/lib/workshop/theme";

export type ActKind = "relu" | "tanh" | "sigmoid";

const ACTS: { kind: ActKind; label: string }[] = [
    { kind: "relu", label: "ReLU" },
    { kind: "tanh", label: "tanh" },
    { kind: "sigmoid", label: "sigmoid" },
];

function actF(kind: ActKind, z: number): number {
    if (kind === "relu") return z > 0 ? z : 0;
    if (kind === "sigmoid") return 1 / (1 + Math.exp(-z));
    return Math.tanh(z);
}

function drawActCurve(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    kind: ActKind,
    active: boolean
) {
    const pad = 5;
    const z0 = -3;
    const z1 = 3;
    const N = 48;
    const zs: number[] = [];
    const ys: number[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= N; i++) {
        const z = z0 + ((z1 - z0) * i) / N;
        const y = actF(kind, z);
        zs.push(z);
        ys.push(y);
        if (y < lo) lo = y;
        if (y > hi) hi = y;
    }
    const span = Math.max(hi - lo, 1e-6);
    lo -= span * 0.14;
    hi += span * 0.14;
    const px = (z: number) => pad + ((W - 2 * pad) * (z - z0)) / (z1 - z0);
    const py = (y: number) => H - pad - ((H - 2 * pad) * (y - lo)) / (hi - lo);

    // reference grid — zero axes
    ctx.strokeStyle = rgbCss(C.border, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(0), pad);
    ctx.lineTo(px(0), H - pad);
    ctx.stroke();
    if (lo <= 0 && hi >= 0) {
        ctx.beginPath();
        ctx.moveTo(pad, py(0));
        ctx.lineTo(W - pad, py(0));
        ctx.stroke();
    }

    // the curve
    ctx.strokeStyle = active ? rgbCss(C.accent) : rgbCss(C.muted, 0.85);
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < zs.length; i++) {
        const X = px(zs[i]);
        const Y = py(ys[i]);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
    }
    ctx.stroke();
}

function ActCell({
    kind,
    label,
    active,
    onSelect,
}: {
    kind: ActKind;
    label: string;
    active: boolean;
    onSelect: () => void;
}) {
    const { ref } = useCanvas(
        (ctx, W, H) => drawActCurve(ctx, W, H, kind, active),
        [active]
    );
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={active}
            className={
                "flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors " +
                (active
                    ? "border-accent bg-accent/10"
                    : "border-border bg-panel hover:border-muted")
            }
        >
            <div className="h-11 w-full">
                <canvas ref={ref} className="block h-full w-full" />
            </div>
            <span
                className={`font-mono text-[10px] ${active ? "text-accent" : "text-muted"}`}
                style={{ fontFamily: FONT_MONO }}
            >
                {label}
            </span>
        </button>
    );
}

export function ActivationPicker({
    value,
    onChange,
}: {
    value: ActKind;
    onChange: (v: ActKind) => void;
}) {
    return (
        <div className="grid grid-cols-3 gap-1.5">
            {ACTS.map((a) => (
                <ActCell
                    key={a.kind}
                    kind={a.kind}
                    label={a.label}
                    active={value === a.kind}
                    onSelect={() => onChange(a.kind)}
                />
            ))}
        </div>
    );
}
