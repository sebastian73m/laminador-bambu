import { defineConfig, type Plugin } from "vite";
// Bundle the viewer into one HTML MCP resource. No runtime CDN or asset URLs.
function inlineResource(): Plugin {
  return {
    name: "inline-mcp-resource",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (b) => b.type === "asset" && b.fileName.endsWith(".html"),
      );
      if (!html || html.type !== "asset") throw Error("Missing viewer HTML");
      let text = String(html.source);
      for (const [name, asset] of Object.entries(bundle)) {
        if (asset.type === "chunk") {
          text = text.replace(
            new RegExp(
              `<script[^>]*src="/?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></script>`,
              "g",
            ),
            () =>
              `<script type="module">${asset.code.replace(/<\/script/gi, "<\\/script")}</script>`,
          );
          delete bundle[name];
        } else if (name.endsWith(".css")) {
          text = text.replace(
            new RegExp(
              `<link[^>]*href="/?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`,
              "g",
            ),
            () => `<style>${asset.source}</style>`,
          );
          delete bundle[name];
        }
      }
      text = text.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, "");
      html.source = text;
    },
  };
}
export default defineConfig({
  root: "viewer",
  plugins: [inlineResource()],
  build: {
    outDir: "../dist/viewer",
    emptyOutDir: true,
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    rollupOptions: { output: { codeSplitting: false } },
    chunkSizeWarningLimit: 1500,
  },
});
