import { readFile, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Network } from "lucide-react";

// Render the library icon unchanged; keep its license with the exported SVG.
const license = await readFile(
  new URL("../node_modules/lucide-react/LICENSE", import.meta.url),
  "utf8",
);
const icon = renderToStaticMarkup(
  createElement(Network, { size: 32, color: "#245b46" }),
);
await writeFile(
  new URL("../public/favicon.svg", import.meta.url),
  `<!-- Generated from lucide-react Network.\n${license}\n-->\n${icon}\n`,
);
