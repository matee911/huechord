# Changelog

All notable changes to Huechord are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Dominant-color extraction from the active document, plotted on a hue wheel and a weighted bar,
  refreshed as the document is edited.
- Harmony detection: complementary, split-complementary, triadic, tetradic, square, analogous and
  monochromatic, reported as a yes-or-no answer rather than a score.
- Near-miss reporting — a frame close to a harmony is named as such, drawn as a dashed shape, with
  the colors that are out of place marked.
- Photoshop Color Sampler points drawn on the wheel alongside the extracted palette.
- Distinct panel states for "no document open" and "nothing worth calling a color yet".

### Changed

- Near-black and near-white colors no longer take part in harmony detection. They remain in the
  palette and in the bar.
