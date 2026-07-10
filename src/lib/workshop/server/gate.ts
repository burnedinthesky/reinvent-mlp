/* Label gating (§0.1, §3.3): hidden-set labels NEVER ship; real/CSV labels are
   blind in P1 and ship from P2 onward (the caller passes `showReal`, computed
   from the room phase — no operator flip); the synthetic reveal slice ships only
   after reveals.reveal100. Produces the exact DataBundle the client seam expects,
   but with labels stripped according to server state. Server-only. */

import type { DataBundle } from "../data-service";
import type { DataPoint, RealRow, Reveals } from "../types";
import type { ActiveStore } from "./store";

function stripReal(rows: RealRow[], show: boolean): RealRow[] {
    return rows.map((r) => (show ? r : { ...r, label: undefined }));
}

function stripPoints(
    points: DataPoint[],
    reveals: Reveals,
    showReal: boolean
): DataPoint[] {
    return points.map((p) => {
        // hidden points: never a label. real points: gated by showReal (P2+).
        // visible synthetic: gated by reveal100.
        if (p.hidden) return { ...p, label: undefined };
        const show = p.real ? showReal : reveals.reveal100;
        return show ? p : { ...p, label: undefined };
    });
}

export function gatedBundle(
    store: ActiveStore,
    reveals: Reveals,
    showReal: boolean
): DataBundle {
    return {
        realRows: stripReal(store.realRows, showReal),
        points: stripPoints(store.points, reveals, showReal),
        config: store.config,
    };
}
