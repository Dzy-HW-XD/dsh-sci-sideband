# Changelog

## 0.3.2 — 2026-11-20

- The evidence tab is hidden from the panel; evidence is still captured and used internally by experiment proposals and review synthesis.
- Evidence counts are removed from the overview, experiment, and review chrome.
- Discovery now scores twice as many candidates per provider (40 at depth 20) instead of slicing to the first page, and shows per-provider candidate/passed counts plus errors.
- Deduplication checks both DOI and title, so an arXiv record without a DOI no longer duplicates the same paper imported from OpenAlex/Semantic Scholar.

## 0.3.1 — 2026-11-19

- Discovery no longer imports a fixed 3 records per source. It retrieves up to 20 candidates per provider (adjustable to 100), scores every candidate against the objective/search phrases, and imports everything above a 0.3 similarity threshold (adjustable 0.2–0.6).
- The Sources tab shows each record's similarity score and the active threshold; the safety ceiling is 120 imports per run.
- Citation deepening uses the same relevance logic and still filters noisy reference/citation neighbors.

## 0.3.0 — 2026-11-19

- Citation snowballing: “按引用深度探索” follows references and cited-by papers of analyzed sources via OpenAlex, with Semantic Scholar fallback, dedup, relevance filtering, and one-level-at-a-time depth.
- Broader first-pass discovery: default 3 records per provider (up to 6), up to 24 records per run.
- Experiment proposals are now a separate, constraint-aware flow: a lab-constraints input (e.g. one A100 80GB, 20 GPU-hours/week) is stored with the project and fed into generation.
- Proposal output is shorter and structured like a research proposal: hypothesis, brief rationale, 3–4 design steps, variables/controls, 2–3 readouts, resources, 1–2 risks.
- Suggestion generation uses lower reasoning effort and a larger output budget, avoiding reasoning-only failures.

## 0.2.2 — 2026-11-19

- Discovery precision: model extracts 2–4 English phrases; arXiv uses quoted AND phrases; candidates must match at least two phrases when available.
- Discovery UX: per-provider count (1–4), “analyze immediately” toggle, and the actual query/expanded state shown in the Sources tab.
- 0 results, partial provider failure, and all-provider failure are distinguished; 429 is retried once with a short backoff.
- Purpose is required for creation and discovery; per-task discovery lock prevents duplicate concurrent inserts.
- Manual DOI is normalized and duplicate DOI/title content is rejected.
- OpenAlex/Crossref access is marked open only with an actual PDF/open link; abstract-less crossref records are skipped.
- Chinese/mixed interests are expanded even when a Latin token such as “SDC” appears.

## 0.2.1 — 2026-11-19

- Chinese research interests are expanded into a concise English academic query with the configured model before provider search; discovery falls back to the original query when no model is available.
- Discovery still accepts English objectives unchanged.

## 0.2.0 — 2026-11-19

- Topics are no longer required. A project needs one research interest/objective; analysis and evidence extraction run from it directly.
- Default source discovery: arXiv, OpenAlex, Crossref, Europe PMC, DOAJ, and Semantic Scholar.
- Discovery UI with channel selection, per-provider counts, deduplication by DOI/title, and automatic background analysis.
- New projects can auto-discover and analyze right after creation.
- Paywalled records fall back to abstract analysis when full text is unavailable.
- Description/README updated to “interest → auto-discover → analyze → evidence → experiments → review”.

## 0.1.0 — 2026-11-19

- First public sideband release.
- Research projects with objective and current-results fields.
- Default discovery from arXiv, OpenAlex, Crossref, Europe PMC, DOAJ, and Semantic Scholar; no topics required.
- Topic decomposition remains optional in the action layer for advanced callers.
- Research content management (paper, preprint, report, dataset, project, patent, blog, other).
- Background content exploration with model analysis and local-rule fallback.
- Traceable evidence table with provenance labels, confidence, manual editing, and per-source citations.
- Experiment suggestions grounded in analyzed content, with explicit “design only, not results” framing.
- Review-article composition with cited references, Markdown copy/download.
- Agent tools: `sci_task`, `sci_source`, `sci_status`, `sci_data`, `sci_experiment`, `sci_report`.
- Self-hosted format-1 plugin market index under `market/`.
