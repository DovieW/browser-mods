import { isAbsolute, relative } from "node:path";
import { checkBundles } from "./bundles.mjs";

export function verifyOutput() {
  return {
    name: "browser-mods:bundle-boundaries",
    apply: "build",
    generateBundle(_, bundle) {
      const chunks = Object.values(bundle).filter(
        (file) => file.type === "chunk",
      );
      const outputs = {};
      const scripts = {};
      for (const chunk of chunks) {
        const name = `dist/${chunk.fileName}`;
        outputs[name] = {
          inputs: Object.fromEntries(
            chunk.moduleIds.map((id) => [
              (isAbsolute(id) ? relative(process.cwd(), id) : id).replaceAll(
                "\\",
                "/",
              ),
              {},
            ]),
          ),
          imports: [...chunk.imports, ...chunk.dynamicImports]
            .filter((file) => bundle[file]?.type === "chunk")
            .map((file) => `dist/${file}`),
        };
        scripts[name] = chunk.code;
      }
      const errors = checkBundles({ outputs }, scripts);
      if (errors.length) this.error(errors.join("\n"));
    },
  };
}
