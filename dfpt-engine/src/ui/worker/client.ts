import type { WorkerRequestBody, WorkerMessage, ResponseFor } from "./protocol.ts";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (done: number, total: number) => void;
};

/**
 * Promise-based RPC client for the engine Web Worker. All heavy physics
 * (grid sampling, dispersion, thermodynamics sweeps) runs off the main
 * thread; this just correlates requests to responses and surfaces progress.
 */
export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    // Production build: classic (IIFE) worker per vite.config.ts's worker.format
    // -- no `type: "module"` needed, for reliable cross-browser support (see
    // the Safari/WebKit note there). Vite's *dev* server, unlike the build,
    // always serves the worker as raw ESM regardless of that setting, so dev
    // mode still needs `type: "module"` here or it won't load at all.
    //
    // Two separate literal call sites (not one call with a computed/ternary
    // options argument) because Vite's dev-mode static analysis for
    // `new Worker(new URL(...), options)` requires `options` to be a literal
    // object at each individual call site -- a dynamic expression there
    // breaks the dev server's worker transform entirely (throws on every
    // request, not just a silent fallback).
    if (import.meta.env.DEV) {
      this.worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    } else {
      this.worker = new Worker(new URL("./engine.worker.ts", import.meta.url));
    }
    this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.kind === "progress") {
        p.onProgress?.(msg.done, msg.total);
      } else if (msg.kind === "result") {
        this.pending.delete(msg.id);
        p.resolve(msg.result);
      } else {
        this.pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
    };
  }

  request<T extends WorkerRequestBody>(
    body: T,
    onProgress?: (done: number, total: number) => void,
  ): Promise<ResponseFor<T["type"]>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.worker.postMessage({ id, body });
    });
  }

  terminate(): void {
    this.worker.terminate();
  }
}
