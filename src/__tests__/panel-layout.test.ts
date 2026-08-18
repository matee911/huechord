import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as sass from "sass";
import postcss from "postcss";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Both contexts, because the stylesheet that broke this layout shipped twice --
// once per entry -- and fixing only the copy whose symptom was visible would
// leave the other waiting for a change of circumstance.
const ENTRIES = [
  "src/index-react.tsx",
  "webview-ui/src/index-webview-react.tsx",
];

// Follow each entry's own imports rather than a list written out here: a
// hardcoded list would let the next stylesheet into the chain just as quietly
// as the last one got in.
const stylesheetsOf = (entry: string): string[] => {
  const path = resolve(repoRoot, entry);
  return Array.from(
    readFileSync(path, "utf8").matchAll(/^import "(\.[^"]+)";$/gm),
  )
    .map((match) => resolve(dirname(path), match[1]))
    .filter((imported) => /\.s?css$/.test(imported))
    .filter((imported) => !relative(repoRoot, imported).startsWith(".."));
};

// Compiled, not read as text: sass resolves `@use` and flattens nesting, media
// queries and grouped selectors, so a rule cannot escape this by being written
// in any of the forms these stylesheets already use.
const declarationsFor = (
  stylesheet: string,
  selector: string,
): Map<string, string> => {
  const found = new Map<string, string>();
  postcss.parse(sass.compile(stylesheet).css).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => {
      found.set(declaration.prop, declaration.value);
    });
  });
  return found;
};

const eachStylesheet = (
  assert: (declarations: (selector: string) => Map<string, string>) => void,
): void => {
  for (const entry of ENTRIES)
    for (const stylesheet of stylesheetsOf(entry))
      assert((selector) => declarationsFor(stylesheet, selector));
};

// The panel is docked next to the image for the whole grading session and its
// width is a working tool: the wider it is, the easier the dots are to judge.
// Every rule here exists because the Vite starter template ships a centred,
// max-width page layout -- correct for a landing page, and the reason the panel
// showed a narrow column with the page background at its sides.
describe("panel layout", () => {
  it("leaves every element between the panel and its contents free to fill it", () => {
    eachStylesheet((declarations) => {
      for (const selector of ["html", "body", "#app", "main"])
        expect(
          declarations(selector).get("max-width"),
          `${selector} max-width`,
        ).toBeUndefined();
    });
  });

  // A centring flex container sizes its items to their content, which is how
  // the starter template made a full-width panel collapse to its longest line
  // of text without any rule saying so.
  it("does not lay the page out as a centred, shrink-to-fit container", () => {
    eachStylesheet((declarations) => {
      for (const selector of ["html", "body", "#app"]) {
        const rule = declarations(selector);

        expect(rule.get("display"), `${selector} display`).not.toBe("flex");
        expect(
          rule.get("place-items"),
          `${selector} place-items`,
        ).toBeUndefined();
      }
    });
  });

  // A fixed pixel ceiling is the same bug in a smaller form: the panel gets
  // wider and the thing the user is looking at does not. Any px in the value
  // counts, because `min(260px, 100%)` caps exactly as hard as `260px`.
  it("sizes the wheel against the panel, not against a fixed pixel width", () => {
    eachStylesheet((declarations) => {
      for (const selector of [".wheel", ".palette-bar"]) {
        const rule = declarations(selector);

        for (const property of ["width", "max-width"])
          expect(
            rule.get(property) ?? "",
            `${selector} ${property}`,
          ).not.toMatch(/\d+px/);
      }
    });
  });

  // The shared measure is where the cap actually lives now, so it is the one
  // value that has to keep tracking the panel rather than a number.
  it("keeps the shared measure tied to the panel's own width", () => {
    const measures = ENTRIES.flatMap(stylesheetsOf)
      .map((stylesheet) => declarationsFor(stylesheet, ".panel"))
      .map((rule) => rule.get("--panel-measure"))
      .filter((value) => value !== undefined);

    expect(measures).not.toHaveLength(0);
    for (const measure of measures) expect(measure).toContain("100%");
  });
});
