/**
 * Cyclic Jacobi eigensolver for real symmetric matrices.
 *
 * Ported from the 2009-lineage prototype's solver. Used on the 2N x 2N real
 * embedding of the complex Hermitian dynamical matrix (see dynamicalMatrix.ts).
 */

/** Eigenvalues only, ascending. Mutates `A`. Fast path for grid/dispersion sampling. */
export function jacobiEigenvalues(A: Float64Array[], n: number): number[] {
  jacobiSweeps(A, n, null);
  const ev: number[] = [];
  for (let k = 0; k < n; k++) ev.push(A[k][k]);
  return ev.sort((a, b) => a - b);
}

export interface EigenResult {
  /** Eigenvalues, ascending. */
  values: number[];
  /** Eigenvectors as columns: vectors[k] is the (length-n) eigenvector for values[k]. */
  vectors: Float64Array[];
}

/** Eigenvalues + eigenvectors, ascending by eigenvalue. Mutates `A`. */
export function jacobiEigen(A: Float64Array[], n: number): EigenResult {
  const V: Float64Array[] = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(n);
    row[i] = 1;
    return row;
  });
  jacobiSweeps(A, n, V);

  const order = Array.from({ length: n }, (_, k) => k).sort((p, q) => A[p][p] - A[q][q]);
  const values = order.map((k) => A[k][k]);
  const vectors = order.map((k) => {
    const col = new Float64Array(n);
    for (let row = 0; row < n; row++) col[row] = V[row][k];
    return col;
  });
  return { values, vectors };
}

function jacobiSweeps(A: Float64Array[], n: number, V: Float64Array[] | null): void {
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    }
    if (off < 1e-14 * n) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-30) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < n; k++) {
          const kp = A[k][p], kq = A[k][q];
          A[k][p] = c * kp - s * kq;
          A[k][q] = s * kp + c * kq;
        }
        for (let k = 0; k < n; k++) {
          const pk = A[p][k], qk = A[q][k];
          A[p][k] = c * pk - s * qk;
          A[q][k] = s * pk + c * qk;
        }
        if (V) {
          for (let k = 0; k < n; k++) {
            const kp = V[k][p], kq = V[k][q];
            V[k][p] = c * kp - s * kq;
            V[k][q] = s * kp + c * kq;
          }
        }
      }
    }
  }
}
