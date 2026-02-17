import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["server.ts", "client.ts"],
  format: ["esm"],
  sourcemap: true,
  clean: true,
});
