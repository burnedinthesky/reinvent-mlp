/* Primitives shared by the production import/generate path
   (server/dataset-io.ts, cleanRealCsv/generateSynth) and the test fixture
   (__tests__/fixtures/dataset.ts, buildDataset — the deleted offline
   generator, kept only for deterministic unit tests). Only the copy-pasted
   *data* lives here so the word lists and the wedge archetype means can't
   drift between them. Pure + client-safe (no prisma). */

/** Codename word bank for pseudonymous student handles. */
const ADJECTIVES = [
    "Sleepy",
    "Restless",
    "Feral",
    "Serene",
    "Jittery",
    "Sullen",
    "Radiant",
    "Cryptic",
    "Wired",
    "Mellow",
    "Nocturnal",
    "Punctual",
    "Chaotic",
    "Wistful",
    "Brisk",
    "Groggy",
    "Zealous",
    "Placid",
    "Frantic",
    "Dapper",
    "Woozy",
    "Stoic",
    "Peppy",
    "Somber",
    "Vivid",
    "Drowsy",
    "Snappy",
    "Hazy",
    "Bold",
    "Quiet",
];

const ANIMALS = [
    "Capybara",
    "Pigeon",
    "Otter",
    "Ferret",
    "Heron",
    "Marmot",
    "Lynx",
    "Gecko",
    "Tapir",
    "Raven",
    "Axolotl",
    "Meerkat",
    "Puffin",
    "Wombat",
    "Civet",
    "Quokka",
    "Ibis",
    "Badger",
    "Narwhal",
    "Shrew",
    "Mongoose",
    "Loris",
    "Kestrel",
    "Vole",
    "Okapi",
    "Serval",
    "Numbat",
    "Dunlin",
    "Fossa",
    "Tanuki",
];

/** Draw `n` unique "Adjective Animal" codenames from the shared word bank.
    Consumes exactly two rng() calls per attempt; guards against exhaustion so an
    n larger than the ~900 combinations still terminates with Anon fallbacks. */
export function makePseudos(rng: () => number, n: number): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 50) {
        const p =
            ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)] +
            " " +
            ANIMALS[Math.floor(rng() * ANIMALS.length)];
        if (!seen.has(p)) {
            seen.add(p);
            out.push(p);
        }
    }
    // fallback suffixing if the word lists are exhausted
    while (out.length < n) out.push(`Anon ${out.length + 1}`);
    return out;
}

/** Canonical z-space archetype means for the default 'wedge' strategy (spec
    §4.3): one class is two spurs (a1/a2), the other a single corner blob (none).
    Shared so the seed generator and the real generator agree on the shape. */
export const WEDGE_MEANS: Record<"a1" | "a2" | "none", [number, number]> = {
    a1: [1.3, -0.2],
    a2: [0.0, 1.4],
    none: [-0.9, -0.7],
};
