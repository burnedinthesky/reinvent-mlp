/* Shared confirm modal (replaces window.confirm). The kit has no Dialog
   primitive, so this mirrors ImportHelpModal: overlay + Island panel, Esc /
   backdrop cancels. `useConfirm` exposes a promise-based `confirm()` so call
   sites keep reading imperatively — `if (!(await confirm({...}))) return`. */

import { useCallback, useEffect, useState } from "react";

import { GhostButton, PrimaryButton } from "./controls";
import { Island } from "./islands";
import { MicroLabel } from "./typography";

export interface ConfirmOptions {
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** micro-label above the title (defaults to "Confirm") */
    eyebrow?: string;
}

export function ConfirmDialog({
    options,
    onResolve,
}: {
    options: ConfirmOptions;
    onResolve: (ok: boolean) => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onResolve(false);
            if (e.key === "Enter") onResolve(true);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onResolve]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={options.title}
            onClick={() => onResolve(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
            <Island className="w-[420px] max-w-full overflow-hidden p-0 motion-safe:animate-pop-in">
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-col"
                >
                    <div className="border-b border-border px-5 py-4">
                        <MicroLabel accent>
                            {options.eyebrow ?? "確認"}
                        </MicroLabel>
                        <h3 className="mt-1 font-display text-lg font-semibold text-fg">
                            {options.title}
                        </h3>
                    </div>
                    <div className="px-5 py-4 text-sm leading-relaxed text-muted">
                        {options.message}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                        <GhostButton bordered onClick={() => onResolve(false)}>
                            {options.cancelLabel ?? "取消"}
                        </GhostButton>
                        <PrimaryButton onClick={() => onResolve(true)}>
                            {options.confirmLabel ?? "確認"}
                        </PrimaryButton>
                    </div>
                </div>
            </Island>
        </div>
    );
}

/** Promise-based confirm. Returns `confirm()` to await a boolean, plus `dialog`
    to render somewhere in the component tree. */
export function useConfirm() {
    const [state, setState] = useState<{
        options: ConfirmOptions;
        resolve: (ok: boolean) => void;
    } | null>(null);

    const confirm = useCallback(
        (options: ConfirmOptions) =>
            new Promise<boolean>((resolve) => setState({ options, resolve })),
        []
    );

    const dialog = state ? (
        <ConfirmDialog
            options={state.options}
            onResolve={(ok) => {
                state.resolve(ok);
                setState(null);
            }}
        />
    ) : null;

    return { confirm, dialog };
}
