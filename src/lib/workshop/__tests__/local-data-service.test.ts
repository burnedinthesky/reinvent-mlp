import { describe, expect, it } from "vitest";

import { LocalDataService } from "../local-data-service";
import { LossLandscape } from "../lossgrid";
import { buildDataset } from "./fixtures/dataset";

describe("LocalDataService", () => {
    it("keeps the loaded landscape when phase progress is reset", () => {
        const { points } = buildDataset();
        const landscape = new LossLandscape(points);
        const service = new LocalDataService();

        Object.assign(service, { points, land: landscape });
        service.resetSession();

        const bowl = service.bowlGrid();
        expect(bowl.gn).toBe(landscape.GN);
        expect(bowl.grid).toBe(landscape.grid);
    });
});

