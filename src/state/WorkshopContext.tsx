/* Workshop store. Holds all persistent, serializable phase state (so switching
   phases and returning preserves your work, like the original single-object
   state), plus the loaded data bundle, server state, session, and a ref for the
   non-serializable MLP playground net engine. Ephemeral drag state stays local to phases. */

import { useEffect, useMemo, useReducer, useRef } from "react";
import type { ReactNode, MutableRefObject } from "react";
import { toast } from "sonner";

import { getWorkshopService } from "#/lib/workshop/data-service";
import { slotRecord } from "#/lib/workshop/blocks";
import { WorkshopContext } from "./workshop-context";
import { CANONICAL_X, CANONICAL_Y } from "#/lib/workshop/features";
import {
    REVEAL_KEYS,
    composeIdentity,
    isValidTeam,
} from "#/lib/workshop/constants";
import type { NetEngine } from "#/lib/workshop/mlp";
import type { MlpNetClient } from "#/lib/workshop/cnn/client";
import type { DatasetId } from "#/lib/workshop/cnn/dataset";
import type { PresetKey } from "#/lib/workshop/cnn/presets";
import type {
    BotProgram,
    ClassLabel,
    CirclesView,
    DataPoint,
    FeatureKey,
    LineModel,
    Phase,
    PhaseCaps,
    RealRow,
    Reveals,
    ServerState,
    StageId,
    StageRunResult,
    VarSlot,
    WorkshopConfig,
} from "#/lib/workshop/types";

/** P4 background terrain-build status carried on /state (server/store.ts). */
type TerrainStatus = NonNullable<ServerState["terrain"]>;

/* ---------- per-phase serializable slices ---------- */

export interface P1State {
    labels: Partial<Record<string, ClassLabel>>;
    attempt: number;
    score: number | null;
    /** accuracy of every submission this session, oldest → newest. Drives the
      score-card history browser (< 2/3 >); `score` mirrors the latest entry. */
    history: number[];
    idx: number;
    mode: "deck" | "review";
    sort: "" | FeatureKey;
}

export interface P2State {
    views: CirclesView[];
    /** index of the view currently being edited on the canvas. */
    activeView: number;
    /** recolor points by the majority-vote ensemble instead of true labels. */
    preview: boolean;
    selected: number;
    brush: ClassLabel;
    defaultCls: ClassLabel;
    /** line-mode boundary (y = wx·x + b) over the active view's axes; used
      only when the p2_line_mode reveal is on. */
    line: LineModel;
    /** normalized x-anchors [0,1] of the two draggable boundary handles. The
      handle y is always derived from the line (wx·x + b), so the handles and
      the wx/b sliders stay in sync — dragging a handle rewrites wx/b, moving a
      slider re-drops the handles onto the new boundary. */
    lineHX: [number, number];
    attempt: number;
    /** judged accuracy over the full point set (latest submission). */
    full: number | null;
    visible: number | null;
    /** line-mode logistic loss from the latest submission (null in lasso mode). */
    lossFull: number | null;
    lossVisible: number | null;
}

/** P3 line-fit. `w`/`b` are the z-scored slope/intercept (b locked at 0 in
    w-only mode). `probes` are the permanent (w, b) submission dots shown in the
    w+b square, each carrying its judged loss + full-set accuracy. */
export interface P3State {
    w: number;
    b: number;
    attempt: number;
    loss: number | null;
    full: number | null;
    visible: number | null;
    probes: { w: number; b: number; loss: number; acc: number }[];
}

/** One scored submission — the student's program run on a single chosen stage
    (Foothill = mlp_a / Range = mlp_b). `loss` (the stage's true final loss) is the
    board value. Empty until the MLP terrains are revealed. */
export interface ExpeditionRun {
    name: string;
    prog: BotProgram;
    stage: StageId;
    result: StageRunResult;
    loss: number;
}

/** which run/stage/step the 3D view + minimap are replaying. `run = -1` = the
    live sandbox run. */
export interface P4View {
    run: number;
    stage: StageId;
    step: number;
}

export interface P4State {
    /** the editor's working card program. */
    prog: BotProgram;
    /** the selected surface: 'bowl' = free Practice, 'mlp_a' = Foothill submission,
      'mlp_b' = Range submission. Drives the deploy action + button label. */
    sel: StageId;
    /** scored submissions (≤ BOT_CAP, shared across stages); empty until revealed. */
    runs: ExpeditionRun[];
    /** the last sandbox run, ephemeral (replayed on the Bowl). */
    sandboxRun: StageRunResult | null;
    /** recent sandbox runs for the practice-chip row (newest last, capped). */
    sandboxHistory: StageRunResult[];
    /** stages whose terrain has been revealed to this student. */
    revealed: StageId[];
    view: P4View;
    botName: string;
    /** camera orbit yaw, radians. */
    camYaw: number;
    /** client-only variable slot rename labels (never sent to the server). */
    varNames: Record<VarSlot, string>;
}

/** P5 "Neuron". Stage 1 is a hand-tuned single sigmoid neuron (w1/w2/b sliders,
    each in [-4, 4]) over dock-chosen z-scored axes; stage 2 (gated by reveals.
    p5_deep) adds 1–2 hidden layers × 1–6 neurons trained with the NetEngine. The
    submission pool (cap 10) is shared across both stages. */
export interface P5State {
    // stage 1 — hand-tuned neuron
    xKey: FeatureKey;
    yKey: FeatureKey;
    w1: number;
    w2: number;
    b: number;
    // stage 2 — going deep (rendered only when reveals.p5_deep)
    stage: 1 | 2;
    layers: number;
    n1: number;
    n2: number;
    lr: string;
    running: boolean;
    step: number;
    loss: number | null;
    /** inspected node — 'out' | 'h<layer>-<idx>'. */
    view: string;
    /** dock preview toggle: recolor the scatter points by the predicted class. */
    preview: boolean;
    // submission (shared pool, cap 10)
    attempt: number;
    /** judged accuracy over the full point set (latest submission). */
    full: number | null;
    visible: number | null;
    /** judged mean BCE loss over the full set (P3-style live-vs-judged readout). */
    judgedLoss: number | null;
}

/** MLP Playground — a client-only hand-rolled MLP over the canonical axes.
    Lives at the standalone /mlp-playground route (no scoring, no leaderboard). */
export interface MlpState {
    layers: number;
    n1: number;
    n2: number;
    act: "tanh" | "relu" | "sigmoid";
    lr: string;
    running: boolean;
    step: number;
    loss: number | null;
    view: string;
}

/** P6 Playground — a client-only NN playground over bundled image datasets. Only
    scalars/selections persist here; loss history + activation snapshots live on
    the (non-serializable) MlpNetClient held in cnnEngineRef. */
export interface P6State {
    dataset: DatasetId;
    arch: PresetKey;
    lr: string;
    /** anneal the learning rate over training steps. */
    lrDecay: boolean;
    batchSize: number;
    act: "relu" | "tanh" | "sigmoid";
    running: boolean;
    step: number;
    loss: number | null;
    acc: number | null;
    valAcc: number | null;
    /** index of the image the hover activations are computed for. */
    currentInput: number;
    /** selected neuron in the diagram, or null. layer 0 = first hidden. */
    selectedNeuron: { layer: number; idx: number } | null;
}

interface Store {
    screen: "join" | "app";
    /** selected squad, 1..TEAM_COUNT (defaults to 第一小隊). */
    team: number;
    /** free-text name typed on the join screen. */
    name: string;
    /** composed identity ('第三小隊 小明'), set on a successful join for display. */
    nickname: string;
    phase: Phase;
    keyHints: boolean;
    p1: P1State;
    p2: P2State;
    p3: P3State;
    p4: P4State;
    p5: P5State;
    mlp: MlpState;
    p6: P6State;
}

type SliceName = "p1" | "p2" | "p3" | "p4" | "p5" | "mlp" | "p6";
type SliceOf<TSlice extends SliceName> = Store[TSlice];
type Patch<T> = Partial<T> | ((s: T) => Partial<T>);

type Action =
    | { type: "setTeam"; v: number }
    | { type: "setName"; v: string }
    | { type: "joined"; nickname: string }
    | { type: "logout" }
    | { type: "setPhase"; v: Phase }
    | { type: "patch"; slice: SliceName; patch: Patch<unknown> };

const initialStore: Store = {
    screen: "join",
    team: 1,
    name: "",
    nickname: "",
    phase: "P1",
    keyHints: true,
    p1: {
        labels: {},
        attempt: 0,
        score: null,
        history: [],
        idx: 0,
        mode: "deck",
        sort: "",
    },
    p2: {
        views: [{ x: CANONICAL_X, y: CANONICAL_Y, circles: [] }],
        activeView: 0,
        preview: false,
        selected: -1,
        brush: 1,
        defaultCls: 0,
        line: { wx: -1, b: 1 },
        lineHX: [0.2, 0.8],
        attempt: 0,
        full: null,
        visible: null,
        lossFull: null,
        lossVisible: null,
    },
    p3: {
        w: 0,
        b: 0,
        attempt: 0,
        loss: null,
        full: null,
        visible: null,
        probes: [],
    },
    p4: {
        // starter program = 醉猴 (the drunk-monkey house bot): one card, move random.
        prog: {
            setup: { start: "random", lr: 0.5 },
            loop: [{ t: "move", dir: { k: "randomDir" } }],
        },
        sel: "bowl",
        runs: [],
        sandboxRun: null,
        sandboxHistory: [],
        revealed: ["bowl"],
        view: { run: -1, stage: "bowl", step: 0 },
        botName: "",
        camYaw: 0.6,
        varNames: slotRecord((s) => s),
    },
    p5: {
        xKey: CANONICAL_X,
        yKey: CANONICAL_Y,
        // Arbitrary non-zero start (range [-4,4]) so the neuron begins as a real,
        // clearly-wrong guess instead of the flat p=0.5 sheet — less confusing to tune.
        // Hardcoded (not Math.random) to avoid SSR/hydration mismatch on first render.
        w1: 1.35,
        w2: -0.75,
        b: 0.6,
        stage: 1,
        layers: 1,
        n1: 3,
        n2: 3,
        lr: "0.1",
        running: false,
        step: 0,
        loss: null,
        view: "out",
        preview: false,
        attempt: 0,
        full: null,
        visible: null,
        judgedLoss: null,
    },
    mlp: {
        layers: 1,
        n1: 3,
        n2: 3,
        act: "tanh",
        lr: "0.1",
        running: false,
        step: 0,
        loss: null,
        view: "out",
    },
    p6: {
        dataset: "mnist",
        arch: "h64",
        lr: "0.05",
        lrDecay: false,
        batchSize: 16,
        act: "relu",
        running: false,
        step: 0,
        loss: null,
        acc: null,
        valAcc: null,
        currentInput: 0,
        selectedNeuron: null,
    },
};

/** The server throws `no active dataset` (requireActiveStore) until the operator
    imports the survey. Matched by substring — the same way the admin console
    detects `unauthorized` — so a wrapped/prefixed message still resolves. */
function isRoomNotOpen(e: unknown): boolean {
    return e instanceof Error && e.message.includes("no active dataset");
}

function reducer(state: Store, action: Action): Store {
    switch (action.type) {
        case "setTeam":
            return { ...state, team: action.v };
        case "setName":
            return { ...state, name: action.v };
        case "joined":
            return { ...state, nickname: action.nickname, screen: "app" };
        case "logout":
            // drop the identity and return to the join screen; keep the prefilled team
            // so a returning student re-enters their own squad by default.
            return { ...state, screen: "join", name: "", nickname: "" };
        case "setPhase":
            return { ...state, phase: action.v };
        case "patch": {
            const cur = state[action.slice] as object;
            const p = action.patch as Patch<object>;
            const delta = typeof p === "function" ? p(cur) : p;
            return { ...state, [action.slice]: { ...cur, ...delta } };
        }
        default:
            return state;
    }
}

/* ---------- context value ---------- */

export interface WorkshopContextValue {
    ready: boolean;
    service: ReturnType<typeof getWorkshopService>;
    config: WorkshopConfig | null;
    realRows: RealRow[];
    points: DataPoint[];
    /** the effective reveals a phase should render against. In self-select mode
      these are the student's own client-side toggles; otherwise the operator's
      server flags. */
    reveals: Reveals | null;
    /** server-armed deadline (ISO) — null when no countdown is live. */
    deadline: string | null;
    /** the student's effective per-phase attempt caps (base cap + operator-granted
      bonus). A phase reads its own cap here (falling back to the base constant)
      so an operator grant re-opens a capped-out submit button within one poll. */
    caps: PhaseCaps;
    /** true when students may freely navigate phases; false = locked to server phase. */
    selfSelect: boolean;
    /** instructor preview mode (`/?preview`): the student UI is rendered locally
      with the phase driven by hand and the server poll never reconciling it, so a
      phase can be demoed without moving the room. Implies self-select behavior. */
    preview: boolean;
    /** connection health; false while the room is unreachable. */
    online: boolean;
    /** room is reachable but the operator hasn't imported the survey yet — the app
      has no data to draw, so we hold on a "waiting for the room to open" screen. */
    waiting: boolean;
    /** P4 background terrain-build status (from /state), or null until the poll
      first carries it. Drives the P4 loading overlay + ready re-probe. */
    terrainStatus: TerrainStatus | null;
    netEngineRef: MutableRefObject<NetEngine | null>;
    /** P5 stage-2 net engine, kept separate from the MLP playground's (which lazily
      recreates its engine on mount and would clobber a shared ref). */
    p5EngineRef: MutableRefObject<NetEngine | null>;
    /** P6 Playground training client (wraps the Web Worker). Non-serializable, held
      here so it survives P6 remounts like the playground engine ref. */
    cnnEngineRef: MutableRefObject<MlpNetClient | null>;
    store: Store;
    setTeam: (v: number) => void;
    setName: (v: string) => void;
    /** enter as (team, name); re-entering the same pair resumes the session. */
    join: () => void;
    /** clear the saved session (token + name) and return to the join screen. */
    logout: () => void;
    setPhase: (v: Phase) => void;
    /** flip one of the student's own reveal flags (self-select mode only). No-op
      on the server flags — when self-select is off, the operator drives reveals. */
    setClientReveal: (key: keyof Reveals, value: boolean) => void;
    patch: <TSlice extends SliceName>(
        slice: TSlice,
        patch: Patch<SliceOf<TSlice>>
    ) => void;
}

/** An all-off Reveals — the starting point for a student's self-select toggles
    (built from REVEAL_KEYS so it can never drift from the flag set). */
function blankReveals(): Reveals {
    return Object.fromEntries(
        REVEAL_KEYS.map((k) => [k, false])
    ) as unknown as Reveals;
}

export function WorkshopProvider({
    children,
    preview = null,
}: {
    children: ReactNode;
    /** instructor preview: the phase to open on, or null for the normal app. */
    preview?: Phase | null;
}) {
    const [store, dispatch] = useReducer(reducer, initialStore);
    const service = useMemo(() => getWorkshopService(), []);
    const netEngineRef = useRef<NetEngine | null>(null);
    const p5EngineRef = useRef<NetEngine | null>(null);
    const cnnEngineRef = useRef<MlpNetClient | null>(null);

    interface DataSlice {
        ready: boolean;
        config: WorkshopConfig | null;
        realRows: RealRow[];
        points: DataPoint[];
        reveals: Reveals | null;
        deadline: string | null;
        /** the student's effective per-phase attempt caps (base + granted bonus). */
        caps: PhaseCaps;
        selfSelect: boolean;
        /** connection health — false once the /state poll has been unreachable for a
        couple of ticks; drives the reconnecting overlay. */
        online: boolean;
        /** room reachable but no dataset imported yet; drives the "room not open"
        overlay, distinct from the (warning) reconnecting one. */
        waiting: boolean;
        /** P4 background terrain-build status carried on /state. */
        terrainStatus: TerrainStatus | null;
    }
    // merge reducer: the 4 s poll patches reveals/deadline without replacing
    // points/realRows, so canvas memo deps stay referentially stable between polls.
    const [data, setData] = useReducer(
        (prev: DataSlice, next: Partial<DataSlice>) => ({ ...prev, ...next }),
        {
            ready: false,
            config: null,
            realRows: [],
            points: [],
            reveals: null,
            deadline: null,
            caps: {},
            selfSelect: false,
            online: true,
            waiting: false,
            terrainStatus: null,
        }
    );

    // the student's own reveal flags, used only in self-select mode (§ the Header
    // toggles write these; phases read them through the exposed `reveals`). Default
    // all-off, and reset whenever self-select turns off so re-entering starts clean.
    const [clientReveals, patchClientReveals] = useReducer(
        (prev: Reveals, next: Partial<Reveals>) => ({ ...prev, ...next }),
        null,
        blankReveals
    );
    useEffect(() => {
        if (!data.selfSelect) patchClientReveals(blankReveals());
    }, [data.selfSelect]);

    const revealsRef = useRef<Reveals | null>(null);
    // mirror of the room's self-select flag so the poll can detect when it flips and
    // re-fetch the bundle (the server re-gates every label on the transition).
    const selfSelectRef = useRef(false);
    const serverPhaseRef = useRef<Phase | null>(null);
    // mirror of the student's current local phase, so the poll can hard-lock
    // against it without re-dispatching an identical phase every 4 s.
    const phaseRef = useRef<Phase>(store.phase);
    // instructor preview: the phase is driven by hand, so the load + poll effects
    // must never reconcile it against the room. Held in a ref so the poll's
    // interval closure reads the current flag without re-subscribing.
    const previewRef = useRef<Phase | null>(preview);
    useEffect(() => {
        previewRef.current = preview;
    }, [preview]);
    // connection-health tracking: consecutive poll failures, and a mirror of the
    // online flag so the interval closure can read it without re-subscribing.
    const failRef = useRef(0);
    const onlineRef = useRef(true);
    const waitingRef = useRef(false);
    useEffect(() => {
        revealsRef.current = data.reveals;
    }, [data.reveals]);
    useEffect(() => {
        phaseRef.current = store.phase;
    }, [store.phase]);
    useEffect(() => {
        onlineRef.current = data.online;
    }, [data.online]);
    useEffect(() => {
        waitingRef.current = data.waiting;
    }, [data.waiting]);

    // instructor preview: skip the join screen and open straight on the requested
    // phase. No saved session is touched (below), so the preview identity can't be
    // clobbered by a real token, and the poll never reconciles the phase.
    useEffect(() => {
        if (!preview) return;
        dispatch({ type: "joined", nickname: "Preview" });
        dispatch({ type: "setPhase", v: preview });
    }, [preview]);

    // restore a saved bearer token before the first data load, and prefill the
    // last squad + name. If we also have a token, the student already joined this
    // room, so drop them straight back into the app on refresh rather than the
    // join screen — the token is the session, and the (team, name) pair
    // reconstructs the display nickname without a server round-trip. Skipped in
    // preview — there is no session, and a saved token must not override it.
    useEffect(() => {
        if (preview) return;
        try {
            const t = localStorage.getItem("mlp_token");
            if (t) service.setToken(t);
            const team = Number(localStorage.getItem("mlp_team"));
            if (team >= 1) dispatch({ type: "setTeam", v: team });
            const name = localStorage.getItem("mlp_name");
            if (name) dispatch({ type: "setName", v: name });
            if (t && name && isValidTeam(team)) {
                dispatch({
                    type: "joined",
                    nickname: composeIdentity(team, name),
                });
            }
        } catch {
            /* storage unavailable — ignore */
        }
    }, [service, preview]);

    // initial load of the drawable bundle + server state. Retries every 4 s while
    // the room is unreachable so a student who opens the app before the room is up
    // — or on a flaky phone — recovers without a manual reload.
    useEffect(() => {
        let alive = true;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const load = () => {
            // getBundle + getState are the connection heartbeat (the same room
            // reachability signal the admin console keys off). getLimits is
            // non-critical enrichment (attempt-grant caps) and requires a valid
            // student token, so a hiccup there must never sink the load into the
            // reconnecting overlay — swallow its failure and fall back to empty caps.
            Promise.all([
                service.getBundle(),
                service.getState(),
                service.getLimits().catch(() => ({}) as PhaseCaps),
            ])
                .then(([bundle, state, caps]) => {
                    if (!alive) return;
                    failRef.current = 0;
                    setData({
                        ready: true,
                        online: true,
                        waiting: false,
                        config: bundle.config,
                        realRows: bundle.realRows,
                        points: bundle.points,
                        reveals: state.reveals,
                        deadline: state.deadline,
                        caps,
                        selfSelect: state.selfSelect,
                        terrainStatus: state.terrain ?? null,
                    });
                    // land on the room's live phase (reload / rejoin recovery). In preview
                    // the phase is driven by hand, so record the room phase but never adopt it.
                    serverPhaseRef.current = state.phase;
                    if (!previewRef.current)
                        dispatch({ type: "setPhase", v: state.phase });
                })
                .catch((e: unknown) => {
                    if (!alive) return;
                    if (isRoomNotOpen(e)) {
                        // room is up, but the operator hasn't loaded the survey yet — hold on
                        // the "waiting for the room to open" screen and keep polling.
                        failRef.current = 0;
                        setData({ online: true, waiting: true });
                    } else {
                        // can't reach the room yet — surface the reconnecting overlay.
                        setData({ online: false, waiting: false });
                    }
                    retry = setTimeout(load, 4000);
                });
        };
        load();
        return () => {
            alive = false;
            if (retry) clearTimeout(retry);
        };
    }, [service]);

    // poll /state so admin reveals, phase changes, and the deadline reach every
    // screen within one poll. Reveal flips of the two label gates re-fetch the
    // bundle (the re-gated labels arrive with it).
    useEffect(() => {
        if (!data.ready) return;
        let inFlight = false;
        const id = setInterval(async () => {
            if (inFlight) return;
            inFlight = true;
            try {
                // getState is the connection heartbeat; getLimits is non-critical
                // per-student enrichment (attempt caps) that needs a valid token, so
                // its failure must not count as a lost connection — swallow it to null
                // and simply keep the previous caps for this tick. Only a getState
                // failure below drives the reconnecting overlay, matching the admin.
                const [state, caps] = await Promise.all([
                    service.getState(),
                    service.getLimits().catch(() => null),
                ]);
                // reachable again — clear the failure streak and drop the overlay.
                failRef.current = 0;
                if (!onlineRef.current) setData({ online: true });
                const prev = revealsRef.current;
                // real/CSV labels are phase-gated (blind in P1, shown from P2), and the
                // synthetic training labels flip with reveal100 — either change re-gates
                // the bundle, so re-fetch it to pick up the newly-revealed labels. A
                // self-select flip also re-gates every label server-side (full reveal on,
                // room-gating off), so it too triggers a re-fetch.
                const phaseChanged = state.phase !== serverPhaseRef.current;
                const selfSelectChanged =
                    state.selfSelect !== selfSelectRef.current;
                const labelsFlipped =
                    phaseChanged ||
                    selfSelectChanged ||
                    (!!prev && state.reveals.reveal100 !== prev.reveal100);
                // preview drives the phase by hand — never reconcile against the room.
                if (previewRef.current) {
                    // no-op: local phase is authoritative.
                } else if (state.selfSelect) {
                    // self-select on — soft push: jump once per operator phase change,
                    // then free navigation stays.
                    if (state.phase !== serverPhaseRef.current) {
                        dispatch({ type: "setPhase", v: state.phase });
                    }
                } else {
                    // self-select off — hard lock: pin every device to the room phase.
                    // guard on the local phase mirror so we don't re-dispatch each poll.
                    if (state.phase !== phaseRef.current) {
                        dispatch({ type: "setPhase", v: state.phase });
                    }
                }
                serverPhaseRef.current = state.phase;
                selfSelectRef.current = state.selfSelect;
                if (labelsFlipped) {
                    const bundle = await service.getBundle();
                    setData({
                        waiting: false,
                        config: bundle.config,
                        realRows: bundle.realRows,
                        points: bundle.points,
                        reveals: state.reveals,
                        deadline: state.deadline,
                        ...(caps ? { caps } : {}),
                        selfSelect: state.selfSelect,
                        terrainStatus: state.terrain ?? null,
                    });
                } else {
                    setData({
                        waiting: false,
                        reveals: state.reveals,
                        deadline: state.deadline,
                        ...(caps ? { caps } : {}),
                        selfSelect: state.selfSelect,
                        terrainStatus: state.terrain ?? null,
                    });
                }
            } catch (e) {
                if (isRoomNotOpen(e)) {
                    // the operator cleared/reset the dataset mid-session — the room is still
                    // up, so fall back to the waiting screen rather than "reconnecting".
                    failRef.current = 0;
                    if (!waitingRef.current)
                        setData({ online: true, waiting: true });
                    return;
                }
                // tolerate one dropped poll (LAN blip); block the screen once the room
                // has been unreachable for two ticks (~8 s) so a disconnected phone can't
                // keep operating outside the operator's control.
                failRef.current += 1;
                if (failRef.current >= 2 && onlineRef.current)
                    setData({ online: false });
            } finally {
                inFlight = false;
            }
        }, 4000);
        return () => clearInterval(id);
    }, [data.ready, service]);

    // preview behaves like a self-select student: the instructor drives phase +
    // reveals locally, so the reveal source, label stripping, and Header nav all
    // key off this rather than the room's server flag.
    const effectiveSelfSelect = !!preview || data.selfSelect;
    // P5 trains on the 100 synthetic dots, but self-navigating students reach it
    // without having flipped reveal100 back in P2 — so force it on for their P5.
    const revealSynth =
        effectiveSelfSelect &&
        (clientReveals.reveal100 || store.phase === "P5");
    // effective reveals: the student's own flags in self-select (with reveal100
    // auto-forced on P5), else the server's.
    const reveals = useMemo(
        () =>
            effectiveSelfSelect
                ? { ...clientReveals, reveal100: revealSynth }
                : data.reveals,
        [effectiveSelfSelect, revealSynth, clientReveals, data.reveals]
    );
    // in self-select the server ships the fully-revealed bundle, so the client owns
    // all label gating: real/CSV labels follow the student's *local* phase (blind in
    // P1, shown from P2), and the synthetic labels follow the effective reveal100.
    // Memoized on the strip inputs so array identity stays stable between polls
    // (canvas deps). In room mode both memos pass the server-gated data through.
    const showRealLocal = !effectiveSelfSelect || store.phase !== "P1";
    const hideSynthetic = effectiveSelfSelect && !revealSynth;
    const points = useMemo(() => {
        if (showRealLocal && !hideSynthetic) return data.points;
        return data.points.map((p) => {
            if (p.hidden || p.label === undefined) return p;
            if (p.real) return showRealLocal ? p : { ...p, label: undefined };
            return hideSynthetic ? { ...p, label: undefined } : p;
        });
    }, [data.points, showRealLocal, hideSynthetic]);
    const realRows = useMemo(() => {
        if (showRealLocal) return data.realRows;
        return data.realRows.map((r) =>
            r.label === undefined ? r : { ...r, label: undefined }
        );
    }, [data.realRows, showRealLocal]);

    const value = useMemo<WorkshopContextValue>(
        () => ({
            ready: data.ready,
            service,
            config: data.config,
            realRows,
            points,
            reveals,
            deadline: data.deadline,
            caps: data.caps,
            selfSelect: effectiveSelfSelect,
            preview: !!preview,
            online: data.online,
            waiting: data.waiting,
            terrainStatus: data.terrainStatus,
            netEngineRef,
            p5EngineRef,
            cnnEngineRef,
            store,
            setTeam: (v) => dispatch({ type: "setTeam", v }),
            setName: (v) => dispatch({ type: "setName", v }),
            join: () => {
                const team = store.team;
                const name = store.name.trim();
                if (!name) return;
                service
                    .join(team, name)
                    .then((res) => {
                        try {
                            localStorage.setItem("mlp_token", res.token);
                            localStorage.setItem("mlp_team", String(team));
                            localStorage.setItem("mlp_name", name);
                        } catch {
                            /* storage unavailable — ignore */
                        }
                        dispatch({ type: "joined", nickname: res.nickname });
                    })
                    .catch((e: unknown) => {
                        // not on the whitelist / server error: surface and stay on the join screen.
                        toast.error(
                            e instanceof Error ? e.message : "join failed"
                        );
                    });
            },
            logout: () => {
                try {
                    localStorage.removeItem("mlp_token");
                    localStorage.removeItem("mlp_name");
                } catch {
                    /* storage unavailable — ignore */
                }
                service.setToken("");
                dispatch({ type: "logout" });
            },
            setPhase: (v) => dispatch({ type: "setPhase", v }),
            setClientReveal: (key, v) => patchClientReveals({ [key]: v }),
            patch: (slice, patch) =>
                dispatch({
                    type: "patch",
                    slice,
                    patch: patch as Patch<unknown>,
                }),
        }),
        [
            data,
            service,
            store,
            reveals,
            points,
            realRows,
            preview,
            effectiveSelfSelect,
        ]
    );

    return (
        <WorkshopContext.Provider value={value}>
            {children}
        </WorkshopContext.Provider>
    );
}
