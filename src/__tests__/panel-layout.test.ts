import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, "../../webview-ui/src/index-webview-react.tsx");

// Read the stylesheets the entry actually imports rather than a list written
// out here: the layout below broke because a boilerplate stylesheet nobody had
// read was in the chain, and a hardcoded list would let the next one in just
// as quietly.
const stylesheets = (): { name: string; css: string }[] =>
  Array.from(readFileSync(entry, "utf8").matchAll(/^import "(\.[^"]+)";$/gm))
    .map((match) => match[1])
    .filter((path) => /\.s?css$/.test(path))
    .map((path) => ({
      name: path,
      css: readFileSync(resolve(dirname(entry), path), "utf8"),
    }));

// Declarations of one top-level rule, with comments and nested rules removed so
// a value mentioned in prose does not read as a declaration.
const declarations = (css: string, selector: string): string[] => {
  const stripped = css
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return Array.from(
    stripped.matchAll(
      new RegExp(`(^|\\})\\s*${selector}\\s*\\{([^{}]*)\\}`, "g"),
    ),
  ).flatMap((match) =>
    match[2]
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean),
  );
};

const valueOf = (
  declarations: string[],
  property: string,
): string | undefined =>
  declarations
    .find((declaration) => declaration.startsWith(`${property}:`))
    ?.slice(property.length + 1)
    .trim();

// The panel is docked next to the image for the whole grading session and its
// width is a working tool: the wider it is, the easier the dots are to judge.
// Every rule here exists because the Vite starter template ships a centered,
// max-width page layout — correct for a landing page, and the reason the panel
// showed a narrow column with dark bands at its sides.
describe("webview panel layout", () => {
  it("lets the page root fill the panel width", () => {
    for (const { name, css } of stylesheets()) {
      const root = declarations(css, "#app");

      expect(valueOf(root, "max-width"), `#app in ${name}`).toBeUndefined();
      expect(valueOf(root, "padding"), `#app in ${name}`).toBeUndefined();
      expect(valueOf(root, "margin"), `#app in ${name}`).toBeUndefined();
    }
  });

  it("does not centre the body as a shrink-to-fit flex container", () => {
    for (const { name, css } of stylesheets()) {
      const body = declarations(css, "body");

      expect(valueOf(body, "display"), `body in ${name}`).not.toBe("flex");
      expect(valueOf(body, "place-items"), `body in ${name}`).toBeUndefined();
      expect(valueOf(body, "min-width"), `body in ${name}`).toBeUndefined();
    }
  });

  // A fixed pixel ceiling would stop the wheel growing partway through the
  // panel's own range, which is the bug in a smaller form: the panel gets
  // wider and the thing the user is looking at does not.
  it("caps the wheel against the panel, not against a fixed pixel width", () => {
    for (const { name, css } of stylesheets())
      for (const selector of [".wheel", ".palette-bar"]) {
        const width = valueOf(declarations(css, selector), "width");
        const cap = valueOf(declarations(css, selector), "max-width");

        for (const value of [width, cap].filter((v) => v !== undefined))
          expect(value, `${selector} in ${name}`).not.toMatch(/^\d+px$/);
      }
  });
});
