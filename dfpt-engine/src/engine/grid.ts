import type { Bond } from "./bonds.ts";
import type { ForceConstants } from "./constants.ts";
import { freqs } from "./dynamicalMatrix.ts";

/**
 * Sample signed frequencies (cm^-1) over a shifted n x n x n Monkhorst-Pack
 * grid in the cubic BZ. Flat array, 15 branches per q-point.
 *
 * This is the hot loop (n^3 dynamical-matrix diagonalisations) — callers on
 * the main thread should run it inside a Web Worker for n >~ 8.
 */
export function gridFreqs(
  bonds: readonly Bond[],
  K: ForceConstants,
  a: number,
  n: number,
  onProgress?: (done: number, total: number) => void,
): number[] {
  const all: number[] = [];
  const total = n * n * n;
  let done = 0;
  for (let ix = 0; ix < n; ix++) {
    for (let iy = 0; iy < n; iy++) {
      for (let iz = 0; iz < n; iz++) {
        const q: [number, number, number] = [
          (((ix + 0.5) / n) * 2 * Math.PI) / a,
          (((iy + 0.5) / n) * 2 * Math.PI) / a,
          (((iz + 0.5) / n) * 2 * Math.PI) / a,
        ];
        for (const w of freqs(q, bonds, K)) all.push(w);
        done++;
        if (onProgress && (done % 8 === 0 || done === total)) onProgress(done, total);
      }
    }
  }
  return all;
}
