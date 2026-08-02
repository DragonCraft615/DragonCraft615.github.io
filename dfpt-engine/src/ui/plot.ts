/** Minimal canvas chart helper — axes, lines, bands, diamonds — shared by every stage. */
export interface Plotter {
  setRange(x: [number, number], y: [number, number]): void;
  frame(
    xlab: string,
    ylab: string,
    xticks: number[],
    yticks: number[],
    fmtx?: (t: number) => string,
    fmty?: (t: number) => string,
  ): void;
  line(xs: number[], ys: number[], color: string, width?: number, dash?: number[]): void;
  band(y0: number, y1: number, color: string): void;
  diamond(x: number, y: number, color: string, s?: number): void;
  label(x: number, y: number, txt: string, color: string): void;
  vline(x: number, color: string, dash?: number[]): void;
  X(x: number): number;
  Y(y: number): number;
  /** Inverse of X/Y — pixel coordinates back to data coordinates. */
  invX(px: number): number;
  invY(py: number): number;
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  P: { L: number; R: number; T: number; B: number };
}

export function plotter(cv: HTMLCanvasElement): Plotter {
  const ctx = cv.getContext("2d")!;
  const W = cv.width, H = cv.height;
  const P = { L: 62, R: 20, T: 18, B: 44 };
  let xr: [number, number] = [0, 1];
  let yr: [number, number] = [0, 1];
  const X = (x: number) => P.L + ((x - xr[0]) / (xr[1] - xr[0])) * (W - P.L - P.R);
  const Y = (y: number) => H - P.B - ((y - yr[0]) / (yr[1] - yr[0])) * (H - P.T - P.B);
  const invX = (px: number) => xr[0] + ((px - P.L) / (W - P.L - P.R)) * (xr[1] - xr[0]);
  const invY = (py: number) => yr[0] + ((H - P.B - py) / (H - P.T - P.B)) * (yr[1] - yr[0]);

  function frame(
    xlab: string,
    ylab: string,
    xticks: number[],
    yticks: number[],
    fmtx?: (t: number) => string,
    fmty?: (t: number) => string,
  ) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#D5D9D4";
    ctx.fillStyle = "#5A616C";
    ctx.font = "11px ui-monospace,monospace";
    ctx.lineWidth = 1;
    for (const t of yticks) {
      ctx.beginPath();
      ctx.moveTo(P.L, Y(t) + 0.5);
      ctx.lineTo(W - P.R, Y(t) + 0.5);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(fmty ? fmty(t) : String(t), P.L - 7, Y(t) + 4);
    }
    for (const t of xticks) {
      ctx.beginPath();
      ctx.moveTo(X(t) + 0.5, P.T);
      ctx.lineTo(X(t) + 0.5, H - P.B);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(fmtx ? fmtx(t) : String(t), X(t), H - P.B + 16);
    }
    ctx.strokeStyle = "#1B1F26";
    ctx.strokeRect(P.L + 0.5, P.T + 0.5, W - P.L - P.R - 1, H - P.T - P.B - 1);
    ctx.textAlign = "center";
    ctx.fillStyle = "#1B1F26";
    ctx.fillText(xlab, (P.L + W - P.R) / 2, H - 8);
    ctx.save();
    ctx.translate(14, (P.T + H - P.B) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(ylab, 0, 0);
    ctx.restore();
  }

  function line(xs: number[], ys: number[], color: string, width = 1.6, dash: number[] = []) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const px = X(xs[i]), py = Y(ys[i]);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function band(y0: number, y1: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(P.L, Math.min(Y(y0), Y(y1)), W - P.L - P.R, Math.abs(Y(y1) - Y(y0)));
  }

  function diamond(x: number, y: number, color: string, s = 6) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(X(x), Y(y) - s);
    ctx.lineTo(X(x) + s, Y(y));
    ctx.lineTo(X(x), Y(y) + s);
    ctx.lineTo(X(x) - s, Y(y));
    ctx.closePath();
    ctx.fill();
  }

  function label(x: number, y: number, txt: string, color: string) {
    ctx.fillStyle = color;
    ctx.font = "11.5px ui-monospace,monospace";
    ctx.textAlign = "left";
    ctx.fillText(txt, X(x) + 8, Y(y) + 4);
  }

  function vline(x: number, color: string, dash: number[] = [4, 4]) {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(X(x) + 0.5, P.T);
    ctx.lineTo(X(x) + 0.5, H - P.B);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function setRange(x: [number, number], y: [number, number]) {
    xr = x;
    yr = y;
  }

  return { setRange, frame, line, band, diamond, label, vline, X, Y, invX, invY, ctx, W, H, P };
}

export const ticks = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

export function niceTicks([a, b]: [number, number]): number[] {
  const span = b - a;
  const step = Math.pow(10, Math.floor(Math.log10(span / 5)));
  const st = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= 7) ?? step * 10;
  const out: number[] = [];
  for (let t = Math.ceil(a / st) * st; t <= b; t += st) out.push(Math.round(t * 100) / 100);
  return out;
}
