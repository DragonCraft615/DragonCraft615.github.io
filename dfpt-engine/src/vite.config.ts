import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // Classic (IIFE) worker bundle, not ES-module -- Safari/WebKit (including
  // iOS Chrome, which is WebKit under Apple's rules) has a long history of
  // unreliable support for `new Worker(url, {type:"module"})`. A classic
  // worker script needs no such support and works everywhere.
  worker: {
    format: "iife",
  },
  test: {
    environment: "node",
    include: ["engine/**/*.test.ts"],
  },
} as any);
