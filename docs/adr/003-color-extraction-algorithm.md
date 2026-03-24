# ADR-003: Use MMCQ for Dominant Color Extraction

**Status**: Accepted
**Date**: 2025-02-25

## Context

The plugin needs to extract 5-8 dominant colors from a downsampled document composite (~10k pixels) in <50ms.

## Options

| Algorithm | Speed (10k px) | Deterministic | JS Ecosystem |
|-----------|----------------|---------------|--------------|
| **MMCQ** | ~10-20ms | Yes | quantize, node-vibrant, colorthief |
| **K-Means++** | ~30-50ms | No | Custom impl needed |
| **Octree** | ~15-25ms | Yes | Few JS libs |
| **Fuzzy C-Means** | ~100ms+ | No | Overkill |

## Decision

Use **MMCQ** (Modified Median Cut Quantization) via the `quantize` library as primary algorithm.

## Rationale

- Deterministic: same input always produces same output (no random init)
- Fastest option for our data size
- Battle-tested: used by Android Palette API, node-vibrant, colorthief
- `quantize` library is ~3kB, zero deps, well-maintained
- Better minority color representation than plain Median Cut

## Consequences

- Less control over exact cluster count compared to K-Means (MMCQ returns up to N colors, may return fewer)
- If users request adjustable sensitivity, may add K-Means++ as alternative later
- Need to filter out near-black/near-white colors that are dominant but uninteresting for harmony analysis
