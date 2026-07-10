/* Roster CSV parser — team coercion, header detection, dedup, drop counting.
   Pure, no DB. */

import { describe, expect, it } from "vitest";

import { composeIdentity } from "../constants";
import { parseWhitelistCsv } from "../whitelist-csv";

describe("parseWhitelistCsv", () => {
    it("parses numeric and labelled squads and skips the header row", () => {
        const { entries, dropped } = parseWhitelistCsv(
            ["team,name", "1,小明", "第三小隊,王小美", "10,阿明"].join("\n")
        );
        expect(dropped).toBe(0);
        expect(entries).toEqual([
            { team: 1, name: "小明" },
            { team: 3, name: "王小美" },
            { team: 10, name: "阿明" },
        ]);
    });

    it("drops blank, malformed, and out-of-range rows and counts them", () => {
        const { entries, dropped } = parseWhitelistCsv(
            ["1,小明", "99,越界", "nope,壞", "2,", "  "].join("\n")
        );
        expect(entries).toEqual([{ team: 1, name: "小明" }]);
        expect(dropped).toBe(3); // 99 out of range, non-numeric team, empty name
    });

    it("dedupes (team, name) case-insensitively", () => {
        const { entries } = parseWhitelistCsv(
            ["1,Amy", "1,amy", "2,Amy"].join("\n")
        );
        expect(entries).toEqual([
            { team: 1, name: "Amy" },
            { team: 2, name: "Amy" },
        ]);
    });

    it("keeps a first data row that is not a header", () => {
        const { entries } = parseWhitelistCsv("第一小隊,小華");
        expect(entries).toEqual([{ team: 1, name: "小華" }]);
        // and the composed identity matches what join() will store.
        expect(composeIdentity(entries[0].team, entries[0].name)).toBe(
            "第一小隊 小華"
        );
    });
});
