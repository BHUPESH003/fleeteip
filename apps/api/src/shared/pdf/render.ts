import { createRequire } from "node:module";
import pdfmake from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";

const require = createRequire(import.meta.url);
const fontDir = require.resolve("pdfmake/package.json").replace("package.json", "fonts/Roboto/");

pdfmake.addFonts({
  Roboto: {
    normal: `${fontDir}Roboto-Regular.ttf`,
    bold: `${fontDir}Roboto-Medium.ttf`,
    italics: `${fontDir}Roboto-Italic.ttf`,
    bolditalics: `${fontDir}Roboto-MediumItalic.ttf`,
  },
});
// Documents never load remote files: a URL in stored text must not make the server fetch it.
pdfmake.setUrlAccessPolicy(() => false);

export async function renderPdf(definition: TDocumentDefinitions): Promise<Buffer> {
  return Buffer.from(await pdfmake.createPdf(definition).getBuffer());
}
