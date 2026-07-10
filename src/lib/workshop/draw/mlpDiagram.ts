/* P6 network diagram — a column of layer blocks (input · hidden×N · output) with
   sampled neuron nodes, tinted live by the current input's activations. Returns
   clickable/hoverable node boxes so the caller can map a pointer to a neuron.
   Borrows the rounded-rect + return-the-boxes idiom from draw/network.ts. */

import { C, FONT_MONO, mix, rgbCss } from "../theme";
import type { LayerMeta } from "../cnn/protocol";

export interface DiagramNode {
    /** fc layer index: -1 = input column, 0 = first hidden, … , L-1 = output. */
    layer: number;
    /** neuron index within its layer. */
    idx: number;
    kind: "input" | "hidden" | "output";
    x: number;
    y: number;
    r: number;
}

/** how many leading neurons a hidden column shows above the ellipsis: 3 for a
    32-wide layer, 7 for 64-wide. Below the ellipsis it always shows the last one,
    so the column reads "3 … 1" (32) or "7 … 1" (64). */
const hiddenTop = (size: number): number => (size <= 32 ? 3 : 7);

/** activation → brightness: 1 − e^(−k·|a|) rises steeply for small signals then
    levels off, so faint activations still read while hot ones don't clip flat.
    Works across relu (unbounded), tanh (±1) and sigmoid/softmax (0..1) ranges. */
const actMag = (a: number): number => 1 - Math.exp(-1.4 * Math.abs(a));

/** a column is laid out as a vertical list of items: real neuron nodes plus an
    optional ellipsis slot standing in for the neurons not drawn. */
type ColItem = { kind: "node"; idx: number } | { kind: "gap" };

/** the first `top` and last `bottom` neuron indices with a ⋮ gap between (or every
    node if the layer already fits). */
function ellipsisItems(size: number, top: number, bottom: number): ColItem[] {
    if (size <= top + bottom) {
        return Array.from({ length: size }, (_, i) => ({
            kind: "node",
            idx: i,
        }));
    }
    const items: ColItem[] = [];
    for (let i = 0; i < top; i++) items.push({ kind: "node", idx: i });
    items.push({ kind: "gap" });
    for (let i = size - bottom; i < size; i++)
        items.push({ kind: "node", idx: i });
    return items;
}

function columnItems(ly: LayerMeta): ColItem[] {
    // hidden reads "3 … 1" (32-wide) / "7 … 1" (64); input reads "12 … 2".
    if (ly.type === "hidden")
        return ellipsisItems(ly.size, hiddenTop(ly.size), 1);
    if (ly.type === "input") return ellipsisItems(ly.size, 12, 2);
    // output shows every class
    return Array.from({ length: ly.size }, (_, i) => ({
        kind: "node",
        idx: i,
    }));
}

export function drawMlpDiagram(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    layers: LayerMeta[],
    acts: Float32Array[] | null,
    selected: { layer: number; idx: number } | null,
    hovered: { layer: number; idx: number } | null
): DiagramNode[] {
    const nodes: DiagramNode[] = [];
    const cols = layers.length;
    const padX = 44;
    const padTop = 30;
    const padBot = 24;
    const colX = (c: number) =>
        padX + (W - 2 * padX) * (cols === 1 ? 0.5 : c / (cols - 1));

    // precompute per-column node ys (and an optional ellipsis position) — items are
    // evenly spaced, so a hidden column reads node·node·node·⋮·node top-to-bottom.
    const avail = H - padTop - padBot;
    type ColLayout = {
        nodes: { idx: number; x: number; y: number }[];
        ellipsis: { x: number; y: number } | null;
    };
    const layoutCols: ColLayout[] = layers.map((ly, c): ColLayout => {
        const items = columnItems(ly);
        const m = items.length;
        const gp = m > 1 ? Math.min(30, avail / (m - 1)) : 0;
        const startY =
            m > 1 ? padTop + (avail - gp * (m - 1)) / 2 : padTop + avail / 2;
        const x = colX(c);
        const cnodes: { idx: number; x: number; y: number }[] = [];
        let ellipsis: { x: number; y: number } | null = null;
        items.forEach((it, k) => {
            const y = m > 1 ? startY + k * gp : startY;
            if (it.kind === "node") cnodes.push({ idx: it.idx, x, y });
            else ellipsis = { x, y };
        });
        return { nodes: cnodes, ellipsis };
    });
    const colNodes = layoutCols.map((l) => l.nodes);

    // edges — tinted by the source neuron's activation so live signal reads as
    // bright lime fan-outs; idle edges fall back to the faint grey baseline.
    for (let c = 0; c < cols - 1; c++) {
        const actRow = acts ? acts[c] : null;
        for (const a of colNodes[c]) {
            const mag = actRow ? actMag(actRow[a.idx]) : 0;
            ctx.strokeStyle = rgbCss(
                mix(C.border, C.accent, mag),
                0.3 + mag * 0.35
            );
            ctx.lineWidth = 1 + mag * 0.4;
            ctx.beginPath();
            for (const b of colNodes[c + 1]) {
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
            }
            ctx.stroke();
        }
    }

    // ellipsis markers (⋮) standing in for the undrawn middle neurons
    for (const l of layoutCols) {
        if (!l.ellipsis) continue;
        ctx.fillStyle = rgbCss(C.muted, 0.7);
        for (let d = -1; d <= 1; d++) {
            ctx.beginPath();
            ctx.arc(l.ellipsis.x, l.ellipsis.y + d * 4, 1.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const fcOf = (c: number) => c - 1; // input col → -1, hidden0 → 0, … output → L-1
    layers.forEach((ly, c) => {
        const kind = ly.type;
        const fc = fcOf(c);
        // column caption
        ctx.fillStyle = rgbCss(C.muted);
        ctx.font = `600 10px ${FONT_MONO}`;
        ctx.textAlign = "center";
        const cap =
            kind === "input"
                ? "輸入"
                : kind === "output"
                  ? "輸出"
                  : `隱藏 ${fc + 1}`;
        ctx.fillText(cap, colX(c), 16);
        const shown = colNodes[c].length;
        if (shown < ly.size) {
            ctx.fillStyle = rgbCss(C.muted, 0.6);
            ctx.font = `500 9px ${FONT_MONO}`;
            ctx.fillText(`${shown}/${ly.size}`, colX(c), H - 10);
        }

        const actRow = acts ? acts[c] : null; // acts[0] = input, aligns with column c
        for (const nd of colNodes[c]) {
            const a = actRow ? actRow[nd.idx] : 0;
            const isSel =
                selected && selected.layer === fc && selected.idx === nd.idx;
            const isHov =
                hovered && hovered.layer === fc && hovered.idx === nd.idx;
            const r = kind === "input" ? 5 : 7;
            const mag = actMag(a);
            ctx.beginPath();
            ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
            // idle dots sit at a readable grey; lime only earns in with activation
            ctx.fillStyle = rgbCss(
                mix(C.border, C.accent, mag),
                0.3 + mag * 0.6
            );
            ctx.fill();
            ctx.lineWidth = isSel ? 2.5 : isHov ? 2 : 1;
            ctx.strokeStyle = isSel
                ? rgbCss(C.accent)
                : isHov
                  ? rgbCss(C.fg, 0.8)
                  : rgbCss(C.border);
            ctx.stroke();
            nodes.push({
                layer: fc,
                idx: nd.idx,
                kind,
                x: nd.x,
                y: nd.y,
                r: r + 3,
            });
        }
    });

    return nodes;
}

/** hit-test a pointer against the returned node boxes (circular). */
export function hitNode(
    nodes: DiagramNode[],
    px: number,
    py: number
): DiagramNode | null {
    let best: DiagramNode | null = null;
    let bestD = Infinity;
    for (const nd of nodes) {
        const d = Math.hypot(px - nd.x, py - nd.y);
        if (d <= nd.r && d < bestD) {
            best = nd;
            bestD = d;
        }
    }
    return best;
}
