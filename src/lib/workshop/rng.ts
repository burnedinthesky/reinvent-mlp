/* Seeded xorshift RNG + Box–Muller gaussian, ported from the prototype so the
   synthetic dataset is byte-for-byte reproducible across runs. */

export interface Rng {
    (): number;
    gauss: () => number;
}

export function createRng(seed: number): Rng {
    // 0 is a fixed point of xorshift: rng() would return 0 forever and gauss()'s
    // rejection loop would never terminate. Remap it (and any multiple of 2^32,
    // which >>> 0 collapses to 0) to an arbitrary nonzero state; every nonzero
    // seed keeps its exact historical stream.
    let s = seed >>> 0 || 0x9e3779b9;
    let spare: number | null = null;
    const rng = (() => {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;
        s >>>= 0;
        return s / 4294967296;
    }) as Rng;
    rng.gauss = () => {
        if (spare !== null) {
            const v = spare;
            spare = null;
            return v;
        }
        let u = 0;
        let v = 0;
        while (u === 0) u = rng();
        while (v === 0) v = rng();
        const m = Math.sqrt(-2 * Math.log(u));
        spare = m * Math.sin(2 * Math.PI * v);
        return m * Math.cos(2 * Math.PI * v);
    };
    return rng;
}
