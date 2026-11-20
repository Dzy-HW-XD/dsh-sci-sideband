# Changelog

## 0.6.1 — 2026-11-20

- Replaced the cramped three-card variable grid with an aligned label/value table; readouts are now a normal bulleted list with a consistent label column.
- Moved section 04 to “变量与读端” to match its content.

## 0.6.0 — 2026-11-20

- Discovery now defaults to 100 candidates per provider and can import up to 200; the previous 50-per-provider clamp is gone.
- Experiment proposals go through an independent reviewer call: a fresh context with no conversation memory, temperature 0, reasoning off. Only approved proposals are returned; review score/issues are stored and shown.
- Each proposal now carries a `references` list with the cited paper title/URL/DOI, not just citation numbers.
- Paper analysis now outputs only five fields: problem addressed, proposed method, key achievements, critical assessment/limitations, and key formulas. The source detail and wiki export use this structure only.

## 0.5.2 — 2026-11-20

- Updated the `sci_task` tool description so `experimentBrief` is documented as a targeted research question/focus, matching the panel.

## 0.5.1 — 2026-11-20

- Relabelled the experiment input from “实验条件” to “想探究的问题” and changed its semantics: it is now a targeted research question/focus, not only a resource field.
- Proposal generation must make every `question` directly answer the user focus; resource limits in the same text are still respected.
- The current project's A100/time limits moved into “已有成果 / 当前进展”, and its focus seeded with a targeted question about quantization width/algorithms and SDC detectability.

## 0.5.0 — 2026-11-20

- Automatic knowledge-base export: every analyzed source is written as Markdown under `sci-sideband/wiki/`, with a machine-readable `index.jsonl` for LLM/RAG ingestion.
- Long-running projects: new projects have optional auto-scan enabled (default 24h, configurable 12/24/72/168h); a host timer checks due projects every 15 minutes and runs discovery/analysis in the background. Existing projects can opt in from the Sources tab.
- Simplified experiment page: removed the project objective block and long constraints hint; the input is now one field labelled “实验条件”. Removed the design-disclaimer paragraph.

## 0.4.0 — 2026-11-20

- Experiment suggestions now follow a concise research-proposal structure: research question/aim, hypothesis, approach, variables/controls, readouts, resources/timeline, risks, expected outcome, and traceable evidence.
- Prompt follows standard proposal components (specific aims/objectives, hypothesis, approach, feasibility, expected outcomes) and enforces short sections.
- Proposal UI uses distinct numbered section labels, compact typography, a left accent rail, and collapsible source evidence to reduce visual fatigue.
- Removed the long experiment-page hint; objectives and constraints remain at the top.

## 0.3.3 — 2026-11-20

- Simplified the panel: removed the query line, discovery summary, provider candidate/passed stats, source error list, and the long discovery/deepening hints from the Sources tab.
- Removed provider/relation/similarity metadata from source cards.
- The overview no longer repeats discovery counts.

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
