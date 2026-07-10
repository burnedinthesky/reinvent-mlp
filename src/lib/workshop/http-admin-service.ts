/* HttpAdminService — bridges the operator console to the real fn/admin.ts
   endpoints, mirroring the HttpDataService pattern. The console UI speaks the
   AdminService types co-located in admin-service.ts; the server fns speak the
   types.ts shapes — the adapt* functions below translate field-by-field and
   are exported for direct unit tests. Every method is backed by a server fn. */

import {
    adaptBalance,
    adaptGenerate,
    adaptStats,
    adaptTerrain,
} from "./admin-adapters";
import { getStateFn } from "./fn/data";
import {
    adminClearDataFn,
    adminDataRowsFn,
    adminDatasetFn,
    adminDeadlineFn,
    adminDumpFn,
    adminGenerateFn,
    adminGenerateReportFn,
    adminGrantAttemptsFn,
    adminImportFn,
    adminGetWhitelistFn,
    adminPhaseFn,
    adminPhaseScoresFn,
    adminPointsFn,
    adminRerollTerrainFn,
    adminResetDbFn,
    adminRevealFn,
    adminSelfSelectFn,
    adminSetWhitelistFn,
    adminStatsFn,
    adminTerrainReportFn,
} from "./fn/admin";
import type {
    AdminDump,
    AdminService,
    AdminStats as UiAdminStats,
    BalanceReport as UiBalanceReport,
    DatasetInfo,
    GenerateParams,
    ImportInput,
    PhaseScores,
    RevealKey,
    TerrainReportsResult,
    VerificationReport,
    WhitelistState,
} from "./admin-service";
import type { DataPoint, Phase, RealRow, ServerState } from "./types";

export class HttpAdminService implements AdminService {
    private token = "";

    setToken(token: string): void {
        this.token = token;
    }

    private get auth() {
        return { adminToken: this.token };
    }

    async getState(): Promise<ServerState> {
        return getStateFn();
    }

    async setPhase(phase: Phase): Promise<ServerState> {
        await adminPhaseFn({ data: { ...this.auth, phase } });
        return getStateFn();
    }

    async setReveal(key: RevealKey, value: boolean): Promise<ServerState> {
        await adminRevealFn({ data: { ...this.auth, key, value } });
        return getStateFn();
    }

    async setDeadline(iso: string | null): Promise<ServerState> {
        await adminDeadlineFn({ data: { ...this.auth, deadline: iso } });
        return getStateFn();
    }

    async setSelfSelect(value: boolean): Promise<ServerState> {
        await adminSelfSelectFn({ data: { ...this.auth, value } });
        return getStateFn();
    }

    async getDataset(): Promise<DatasetInfo | null> {
        return adminDatasetFn({ data: this.auth });
    }

    async getDataRows(): Promise<RealRow[]> {
        return adminDataRowsFn({ data: this.auth });
    }

    async getPoints(): Promise<DataPoint[]> {
        return adminPointsFn({ data: this.auth });
    }

    async clearData(): Promise<void> {
        await adminClearDataFn({ data: this.auth });
    }

    async resetDb(): Promise<void> {
        await adminResetDbFn({ data: this.auth });
    }

    async importDataset(input: ImportInput): Promise<UiBalanceReport> {
        const report = await adminImportFn({
            data: { ...this.auth, csv: input.csv },
        });
        return adaptBalance(report);
    }

    async generate(params: GenerateParams): Promise<VerificationReport> {
        // every console preset is a knob-set over the server 'wedge' strategy
        // ('linear' / 'blobs' exist server-side but are not exposed as presets).
        const report = await adminGenerateFn({
            data: {
                ...this.auth,
                strategy: "wedge",
                sep: params.sep,
                noise: params.noise,
                mix: params.mix,
                flip: params.flip,
                seed: params.seed,
            },
        });
        return adaptGenerate(report);
    }

    async getGenerateReport(): Promise<VerificationReport | null> {
        const report = await adminGenerateReportFn({ data: this.auth });
        return report ? adaptGenerate(report) : null;
    }

    async getTerrainReports(): Promise<TerrainReportsResult> {
        const { status, stages } = await adminTerrainReportFn({
            data: this.auth,
        });
        return {
            status: {
                state: status.state,
                progress: status.progress,
                phase: status.phase,
            },
            reports: stages.map(adaptTerrain),
        };
    }

    async rerollTerrain(): Promise<void> {
        await adminRerollTerrainFn({ data: this.auth });
    }

    async getStats(): Promise<UiAdminStats> {
        const [stats, state] = await Promise.all([
            adminStatsFn({ data: this.auth }),
            getStateFn(),
        ]);
        return adaptStats(stats, state.phase);
    }

    async getPhaseScores(phase: Phase): Promise<PhaseScores> {
        // values already in display units (acc % / raw loss) — no adapter needed.
        return adminPhaseScoresFn({ data: { ...this.auth, phase } });
    }

    async grantAttempts(
        studentId: string,
        phase: Phase,
        delta: number
    ): Promise<void> {
        await adminGrantAttemptsFn({
            data: { ...this.auth, studentId, phase, delta },
        });
    }

    async getWhitelist(): Promise<WhitelistState> {
        return adminGetWhitelistFn({ data: this.auth });
    }

    async setWhitelist(state: WhitelistState): Promise<void> {
        await adminSetWhitelistFn({
            data: {
                ...this.auth,
                enabled: state.enabled,
                entries: state.entries,
            },
        });
    }

    async dump(): Promise<AdminDump> {
        const [state, dataset, stats, raw] = await Promise.all([
            getStateFn(),
            this.getDataset(),
            this.getStats(),
            adminDumpFn({ data: this.auth }),
        ]);
        return {
            exportedAt: new Date().toISOString(),
            state,
            dataset,
            stats,
            raw,
        };
    }
}
