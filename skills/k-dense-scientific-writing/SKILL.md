---
name: scientific-writing
source: K-Dense-AI/claude-scientific-writer
source-path: skills/scientific-writing/SKILL.md
license: MIT
version: "2.1"
adapted-for: dsh-sci-sideband
---

# Scientific Writing (K-Dense-derived)

Adapted from K-Dense Scientific Agent Skills (MIT). Full upstream skill:
https://github.com/K-Dense-AI/claude-scientific-writer/blob/main/skills/scientific-writing/SKILL.md

## Rules

- Never invent citations, results, data values, sample sizes, units, methods, or quotations.
- Every factual/numeric claim must map to a verified project paper; otherwise label it as a hypothesis.
- Keep drafting, evidence verification, and final approval as separate stages.
- Use IMRaD where appropriate; state the research question, contribution, and significance.
- Separate result from interpretation; preserve uncertainty and alternative explanations.
- Do not convert association into causation or non-significance into equivalence.
- State concrete limitations and bound generalizability.
- Report negative, null, adverse, and inconclusive findings when relevant.
- Figures/tables are provenance-bound: units, denominators, sample size, uncertainty, source data.
- Do not self-praise. No "novel", "groundbreaking", "superior" without specific evidence.
- Match title, abstract, and conclusion to the completed main text.
- The user's targeted research question overrides generic background; answer it directly.

## Before writing

Mark unresolved: document type, audience/venue, available evidence, methods/results, and missing data.
Use `not reported` or `data needed`; never fill gaps with plausible boilerplate.
