# ADR-004: Use Bolt UXP (Vite) for Build Tooling

**Status**: Accepted
**Date**: 2025-02-25

## Context

UXP plugins using React/TypeScript need a bundler. Adobe's official starter uses Webpack 4 with known compatibility issues.

## Options

| Tool                  | Bundler   | Pros                                             | Cons                                      |
| --------------------- | --------- | ------------------------------------------------ | ----------------------------------------- |
| **Bolt UXP**          | Vite      | Modern, fast HMR, React/Svelte/Vue, TS+Sass, MIT | Community-maintained                      |
| Adobe React Starter   | Webpack 4 | Official                                         | Outdated deps, `acorn-base` errors, stale |
| SWC UXP React Starter | Webpack 5 | Official, SWC components                         | Tightly coupled to SWC                    |
| Custom Webpack 5      | Webpack 5 | Full control                                     | DIY setup overhead                        |

## Decision

Use **Bolt UXP** (Vite + React + TypeScript) as the project scaffold.

## Rationale

- Vite is significantly faster than Webpack for dev builds (native ESM, esbuild)
- Bolt UXP handles dual-context builds (UXP + WebView) out of the box
- Active maintenance, MIT license, used by production plugins
- Adobe's official starters have known dependency issues and are not actively updated
- Supports React, which aligns with team familiarity

## Consequences

- Not an official Adobe tool (community risk, though widely adopted)
- Must verify Bolt UXP output compatibility with UXP Developer Tool on each UDT update
- Lock Vite and plugin versions to avoid breaking changes
