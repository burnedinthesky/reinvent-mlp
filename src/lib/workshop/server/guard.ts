/* Submission gate (§3.3, journey A0.6/A0.7): submissions are only accepted for
   the room's current phase and before the armed deadline. The uni-tier API
   channel opts out of both (budget-only); a handler may also pass an
   allowIfReveal escape hatch that opens the gate whenever a given reveal is
   armed, regardless of phase/deadline. checkGate is pure so the rules unit-test
   without a DB. Server-only. */

import { getServerState } from "./state";
import type { Phase, Reveals, ServerState } from "../types";

export class GateError extends Error {}

export interface GateOpts {
    /** phase this submission belongs to; omit to skip the phase check. */
    phase?: Phase;
    /** reveal flag that opens the gate regardless of phase or deadline. */
    allowIfReveal?: keyof Reveals;
    /** set false to skip deadline enforcement. default true. */
    deadline?: boolean;
}

export function checkGate(state: ServerState, now: Date, opts: GateOpts): void {
    if (opts.allowIfReveal && state.reveals[opts.allowIfReveal]) return;
    // self-select opens the room for free navigation: students submit for their own
    // local phase with no deadline — skip both the deadline and room-phase checks.
    if (state.selfSelect) return;
    if (opts.deadline !== false && state.deadline) {
        if (now.getTime() > new Date(state.deadline).getTime()) {
            throw new GateError("deadline passed");
        }
    }
    if (opts.phase && opts.phase !== state.phase) {
        throw new GateError(`phase closed (${opts.phase} ≠ ${state.phase})`);
    }
}

/** getServerState() + checkGate(). Returns the state so handlers that also
    need reveals reuse the single read. */
export async function requireGate(opts: GateOpts): Promise<ServerState> {
    const state = await getServerState();
    checkGate(state, new Date(), opts);
    return state;
}
