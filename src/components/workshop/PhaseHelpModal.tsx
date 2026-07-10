/* Per-phase "how to play" modal, opened from the account indicator (Header
   popover). Consolidates the guidance that used to float over the canvas.
   Hand-rolled modal — the kit has no Dialog primitive; overlay + Island panel,
   Esc / backdrop to close (mirrors admin/ImportHelpModal). Every scored phase
   (P1–P6) has a body; NONE shows a friendly placeholder. */

import { useEffect } from "react";

import { GhostButton, Island, Kbd, MicroLabel } from "#/components/workshop/ui";
import type { TranslateFn } from "#/lib/i18n/context";
import { useI18n } from "#/lib/i18n/context";
import { BOT_CAP, LINE_CAP } from "#/lib/workshop/constants";
import type { Phase } from "#/lib/workshop/types";

/** P1 body — the guess-the-class card deck. */
function P1Help({ t }: { t: TranslateFn }) {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>{t("help.p1.flip.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p1.flip.body.1")}
                    <strong className="text-fg">
                        {t("help.p1.flip.body.median")}
                    </strong>
                    {t("help.p1.flip.body.2")}
                    <strong className="text-accent3">
                        {t("help.p1.flip.body.owl")}
                    </strong>
                    {t("help.p1.flip.body.3")}
                    <strong className="text-accent2">
                        {t("help.p1.flip.body.early")}
                    </strong>
                    {t("help.p1.flip.body.4")}
                </p>
            </div>

            <div>
                <MicroLabel>{t("help.p1.kbd.title")}</MicroLabel>
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted">
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>A</Kbd> {t("help.p1.kbd.owl")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>B</Kbd> {t("help.p1.kbd.early")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>←</Kbd>
                        <Kbd>→</Kbd> {t("help.p1.kbd.move")}
                    </span>
                    <span>{t("help.p1.kbd.sort")}</span>
                </div>
            </div>

            <div>
                <MicroLabel>{t("help.p1.score.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p1.score.body.1")}
                    <strong className="text-fg">
                        {t("help.p1.score.body.blind")}
                    </strong>
                    {t("help.p1.score.body.2")}
                    <strong className="text-fg">
                        {t("help.p1.score.body.attempts")}
                    </strong>
                    {t("help.p1.score.body.3")}
                </p>
            </div>
        </div>
    );
}

/** P3 body — fit a single straight boundary; slope-only until the (w, b) plane
    reveal is flipped on. */
function P3Help({ t, wbMode }: { t: TranslateFn; wbMode: boolean }) {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>{t("help.p3.fit.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p3.fit.body.1")}
                    <strong className="text-accent">
                        {t("help.p3.fit.body.loss")}
                    </strong>
                    {t("help.p3.fit.body.2")}
                </p>
            </div>

            <div>
                <MicroLabel>
                    {wbMode
                        ? t("help.p3.slope.title.wb")
                        : t("help.p3.slope.title.slope")}
                </MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {wbMode ? (
                        <>
                            {t("help.p3.slope.wb.1")}{" "}
                            <span className="font-mono text-fg">(w, b)</span>{" "}
                            {t("help.p3.slope.wb.2")}{" "}
                            <span className="font-mono text-fg">w</span>{" "}
                            {t("help.p3.slope.wb.3")}{" "}
                            <span className="font-mono text-fg">b</span>{" "}
                            {t("help.p3.slope.wb.4")}
                        </>
                    ) : (
                        <>
                            {t("help.p3.slope.slope.1")}{" "}
                            <span className="font-mono text-fg">w</span>{" "}
                            {t("help.p3.slope.slope.2")}{" "}
                            <span className="font-mono text-fg">b</span>{" "}
                            {t("help.p3.slope.slope.3")}
                        </>
                    )}
                </p>
            </div>

            <div>
                <MicroLabel>{t("help.p3.score.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p3.score.body.1")}
                    <strong className="text-fg">
                        {t("help.p3.score.body.hidden")}
                    </strong>
                    {t("help.p3.score.body.2")}
                    <strong className="text-accent">
                        {t("help.p3.score.body.flash")}
                    </strong>
                    {t("help.p3.score.body.3")}{" "}
                    <strong className="text-fg">
                        {t("help.p3.score.body.attempts", { cap: LINE_CAP })}
                    </strong>
                    {t("help.p3.score.body.4")}
                </p>
            </div>
        </div>
    );
}

/** P6 body — the image-dataset NN playground. */
function P6Help({ t }: { t: TranslateFn }) {
    return (
        <div className="flex flex-col gap-4">
            <div>
                <MicroLabel>{t("help.p6.core.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p6.core.body.1")}{" "}
                    <strong className="text-accent">
                        {t("help.p6.core.lossDown")}
                    </strong>
                    {t("help.p6.core.body.2")}
                    <strong className="text-accent">
                        {t("help.p6.core.accUp")}
                    </strong>
                    {t("help.p6.core.body.3")}
                </p>
            </div>
            <div>
                <MicroLabel>{t("help.p6.neuron.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p6.neuron.body.1")}
                    <strong className="text-fg">
                        {t("help.p6.neuron.template")}
                    </strong>
                    {t("help.p6.neuron.body.2")}
                </p>
            </div>
        </div>
    );
}

/** P2 body — the lasso/line guidance and keyboard shortcuts that used to live in
    the floating HintCard and PillChips. */
function P2Help({ t, lineMode }: { t: TranslateFn; lineMode: boolean }) {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>{t("help.p2.rule.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p2.rule.body.1")}
                    <strong className="text-accent3">
                        {t("help.p2.rule.body.owl")}
                    </strong>
                    {t("help.p2.rule.body.2")}
                    <strong className="text-accent2">
                        {t("help.p2.rule.body.early")}
                    </strong>
                    {t("help.p2.rule.body.3")}
                </p>
            </div>

            <div>
                <MicroLabel>{t("help.p2.kbd.title")}</MicroLabel>
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted">
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>A</Kbd>
                        <Kbd>B</Kbd> {t("help.p2.kbd.recolor")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>Del</Kbd> {t("help.p2.kbd.delete")}
                    </span>
                    <span>{t("help.p2.kbd.drag")}</span>
                    <span>{t("help.p2.kbd.zoom")}</span>
                </div>
            </div>

            {lineMode && (
                <div>
                    <MicroLabel>{t("help.p2.line.title")}</MicroLabel>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {t("help.p2.line.body.1")}
                        <span className="font-mono text-fg">wx</span> /{" "}
                        <span className="font-mono text-fg">b</span>{" "}
                        {t("help.p2.line.body.2")}
                    </p>
                </div>
            )}
        </div>
    );
}

/** P4 body — the guidance that used to float centered over the terrain canvas. */
function P4Help({ t }: { t: TranslateFn }) {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>{t("help.p4.loop.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p4.loop.body.1")}
                    <strong>{t("help.p4.loop.observe")}</strong>
                    {t("help.p4.loop.observeParen")}
                    <strong>{t("help.p4.loop.vars")}</strong>
                    {t("help.p4.loop.varsParen")}
                    <strong>{t("help.p4.loop.logic")}</strong>
                    {t("help.p4.loop.logicParen")}
                    <strong>{t("help.p4.loop.action")}</strong>
                    {t("help.p4.loop.actionParen")}{" "}
                    <strong className="text-accent">
                        {t("help.p4.loop.times")}
                    </strong>
                    {t("help.p4.loop.body.2")}
                    <strong>{t("help.p4.loop.oneStudent")}</strong>
                    {t("help.p4.loop.body.3")}
                </p>
            </div>

            <div>
                <MicroLabel>{t("help.p4.sense.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    <strong>{t("help.p4.sense.observe")}</strong>
                    {t("help.p4.sense.body.1")}
                    <strong>{t("help.p4.sense.varSlot")}</strong>
                    {t("help.p4.sense.body.2")}
                    <strong>{t("help.p4.sense.scan")}</strong>
                    {t("help.p4.sense.body.3")}
                    <em>{t("help.p4.sense.direction")}</em>
                    {t("help.p4.sense.body.4")}
                    <strong className="text-accent">
                        {t("help.p4.sense.fooled")}
                    </strong>
                    {t("help.p4.sense.body.5")}
                </p>
            </div>

            <div>
                <MicroLabel>{t("help.p4.step.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    <strong>{t("help.p4.step.stepLen")}</strong>
                    {t("help.p4.step.body.1")}
                    <strong>{t("help.p4.step.lr")}</strong>
                    {t("help.p4.step.body.2")}
                    <strong>{t("help.p4.step.stepMul")}</strong>{" "}
                    {t("help.p4.step.body.3")}
                </p>
            </div>

            <div>
                <MicroLabel>{t("help.p4.practice.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p4.practice.body.1")}
                    <strong className="text-accent">
                        {t("p4.stage.bowl")}
                    </strong>
                    {t("help.p4.practice.body.2")}
                    <strong className="text-accent">
                        {t("p4.stage.mlp_a")}
                    </strong>
                    {t("help.p4.practice.hillsParen")}
                    <strong className="text-accent">
                        {t("p4.stage.mlp_b")}
                    </strong>
                    {t("help.p4.practice.mtnParen", { cap: BOT_CAP })}
                    <strong>{t("help.p4.practice.judge")}</strong>
                    {t("help.p4.practice.body.3")}
                    <em>{t("help.p4.practice.whole")}</em>
                    {t("help.p4.practice.body.4")}
                </p>
            </div>
        </div>
    );
}

/** P5 body — the single-neuron guidance, plus the "going deep" beat once the
    p5_deep reveal is on. */
function P5Help({ t, deep }: { t: TranslateFn; deep: boolean }) {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>{t("help.p5.neuron.title")}</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t("help.p5.neuron.body.1")}
                    <span className="font-mono text-fg">
                        p = σ(w1·x + w2·y + b)
                    </span>
                    {t("help.p5.neuron.body.2")}{" "}
                    <strong className="text-accent">
                        {t("help.p5.neuron.bce")}
                    </strong>{" "}
                    {t("help.p5.neuron.body.3")}
                </p>
            </div>
            {deep ? (
                <div>
                    <MicroLabel>{t("help.p5.deep.title")}</MicroLabel>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {t("help.p5.deep.body.1")}{" "}
                        <strong className="text-accent">
                            {t("help.p5.deep.stage2")}
                        </strong>
                        {t("help.p5.deep.body.2")}
                        <strong>{t("help.p5.deep.gd")}</strong>
                        {t("help.p5.deep.body.3")}{" "}
                        <Kbd>Space</Kbd>
                        {t("help.p5.deep.body.4")}
                    </p>
                </div>
            ) : (
                <div>
                    <MicroLabel>{t("help.p5.score.title")}</MicroLabel>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {t("help.p5.score.body.1")}
                        <strong className="text-fg">
                            {t("help.p5.score.attempts")}
                        </strong>
                        {t("help.p5.score.body.2")}
                    </p>
                </div>
            )}
        </div>
    );
}

export function PhaseHelpModal({
    phase,
    lineMode,
    p3wb,
    p5Deep,
    onClose,
}: {
    phase: Phase;
    lineMode: boolean;
    p3wb: boolean;
    p5Deep: boolean;
    onClose: () => void;
}) {
    const { t } = useI18n();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const title = t(`phases.${phase}.name`);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t("help.aria.title", { title })}
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
            <Island className="flex max-h-[85vh] w-[480px] max-w-full flex-col overflow-hidden p-0 motion-safe:animate-pop-in">
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex max-h-[85vh] flex-col"
                >
                    <div className="flex items-start justify-between border-b border-border px-5 py-4">
                        <div>
                            <MicroLabel accent>{t("help.eyebrow")}</MicroLabel>
                            <h3 className="mt-1 font-display text-lg font-semibold text-fg">
                                {title}
                            </h3>
                        </div>
                        <GhostButton
                            bordered
                            onClick={onClose}
                            aria-label={t("common.close")}
                        >
                            {t("common.close")} ✕
                        </GhostButton>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                        {phase === "P1" ? (
                            <P1Help t={t} />
                        ) : phase === "P2" ? (
                            <P2Help t={t} lineMode={lineMode} />
                        ) : phase === "P3" ? (
                            <P3Help t={t} wbMode={p3wb} />
                        ) : phase === "P4" ? (
                            <P4Help t={t} />
                        ) : phase === "P5" ? (
                            <P5Help t={t} deep={p5Deep} />
                        ) : phase === "P6" ? (
                            <P6Help t={t} />
                        ) : (
                            <p className="text-sm leading-relaxed text-muted">
                                {t("help.none")}
                            </p>
                        )}
                    </div>
                </div>
            </Island>
        </div>
    );
}
