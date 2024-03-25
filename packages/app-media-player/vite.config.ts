import path from "path";
import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => {
    const isProd = mode === "production";

    return {
        build: {
            lib: {
                entry: path.resolve(__dirname, "src/index.tsx"),
                formats: ["es", "cjs"],
                fileName: "main",
                name: "NetlessAppMediaPlayer",
            },
            sourcemap: !isProd,
            outDir: "dist",
            rollupOptions: {
                external: ["@netless/window-manager", "react", "react-dom", "video.js"],
                output: { exports: "named" },
            },
            minify: false,
        },
    };
});
