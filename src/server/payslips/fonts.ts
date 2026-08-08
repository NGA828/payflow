import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Inter for the payslip PDF. Paths are resolved at runtime from the package
 * (a static require.resolve would make webpack try to bundle the binary).
 * WOFF (not the woff2 variants) — fontkit in @react-pdf/renderer decodes it.
 * Standalone production output keeps these via outputFileTracingIncludes.
 */
const FONT_FILES: Array<{ file: string; fontWeight: 400 | 500 | 600 | 700 }> = [
  { file: "inter-latin-400-normal.woff", fontWeight: 400 },
  { file: "inter-latin-500-normal.woff", fontWeight: 500 },
  { file: "inter-latin-600-normal.woff", fontWeight: 600 },
  { file: "inter-latin-700-normal.woff", fontWeight: 700 },
];

let registered = false;

export function registerInterFonts(): void {
  if (registered) return;
  const dir = path.join(process.cwd(), "node_modules", "@fontsource", "inter", "files");
  Font.register({
    family: "Inter",
    fonts: FONT_FILES.map(({ file, fontWeight }) => ({
      src: path.join(dir, file),
      fontWeight,
    })),
  });
  registered = true;
}
