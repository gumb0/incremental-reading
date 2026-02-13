import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/main.ts",
  output: {
    file: "main.js",
    format: "cjs",
    sourcemap: true,
    exports: "default"
  },
  external: ["obsidian"],
  plugins: [resolve({ browser: true }), commonjs(), typescript()]
};
