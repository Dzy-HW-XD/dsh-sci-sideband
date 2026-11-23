# Changelog

## 0.12.3 — 2026-11-23

- Full-text fetching: arXiv URLs try `/html`, ar5iv, and `/pdf` instead of only the abstract page; the longest readable candidate wins.
- Added `sci_source action=reanalyze` to re-fetch all sources and re-run analysis, replacing abstract-only analyses.

## 0.12.2 — 2026-11-23

- Removed the knowledge-card listing tab; the knowledge base stays internal for writer/reviewer.
- Backfills figure cards from figure captions for existing sources, and new analyses emit figure interpretation cards.
- Background evidence consolidation: the router periodically classifies/merges cards even when no new papers are due, tracked by `knowledgeReviewedAt`.

## 0.12.1 — 2026-11-23

- Backfilled knowledge cards from existing analyses, so old projects populate the knowledge base without re-running every paper.
- Compacted the public state payload (source analysis + report list) to keep the panel and state RPC responsive with 38+ sources and cards.
- Added the knowledge tab and router status to the public state.

## 0.12.0 — 2026-11-23

- Analysis now emits long-term knowledge cards: experiment data, conclusions, and figure/table interpretations with provenance.
- Added a unified `cards` knowledge base; evidence reviewer classifies, merges, and deletes cards (`cardOps`), and the pipeline applies the result.
- Writer consumes knowledge cards (not only raw sources/evidence) when writing reports.
- Added a **知识库** tab showing cards grouped by theme/kind.
- Added a top-level **Router**: auto-scan now triggers `grabber → analysis → evidence reviewer` with `mode=ingest`; writer remains user-triggered.

## 0.11.6 — 2026-11-23

- PDF export no longer opens a popup (which the browser blocked). It renders a print-only A4 report in the current page and calls `window.print()`, so “另存为 PDF” works without popup permission.

## 0.11.5 — 2026-11-23

- Fixed the broken PDF export: it no longer prints a hidden 0×0 iframe (which could save an empty/unopenable PDF). It now opens a visible A4 report preview with a “打印 / 保存为 PDF” button.

## 0.11.4 — 2026-11-23

- Reduced report corpus size (900-char summaries, 6 evidence rows/source) and capped the manuscript at 8 sections/2000 characters; raised output budget to 40k. This prevents the 38-source report from exhausting JSON output and falling back to evidence assembly.

## 0.11.3 — 2026-11-23

- Writer now explicitly honors a format/venue requested in the focus (e.g. IEEE): Index Terms, numbered sections, References, thematic synthesis instead of per-paper summaries.

## 0.11.2 — 2026-11-23

- Fixed report generation falling back to evidence assembly: the writer now gets a 30k output budget and low reasoning effort, so long report JSON is not cut off into “模型返回的内容不是可解析的 JSON”.

## 0.11.1 — 2026-11-23

- Removed the local `scientific-figures` skill and its manifest entry; writer only loads K-Dense `scientific-writing`. Report figure-plan generation was removed to reduce prompt/output overhead.

## 0.11.0 — 2026-11-23

- Writer now loads a K-Dense-derived `scientific-writing` skill; writer/proposal reviewers load a K-Dense-derived `peer-review` skill. Source, MIT license, version, and pinned commit are recorded in `skills/manifest.json`.
- Added a **技能管理** tab: lists local/external skills, source, version, license, pinned commit, install state, and checks GitHub for newer commits.
- Report writer receives the input focus and must answer it directly; reviewers use the same focus.
- Added **导出 PDF** (A4 print layout) and a figure plan in reports.
- Simplified Sources to add + count and Reports to one focus input + one generate button.

## 0.10.2 — 2026-11-23

- Writer now receives the report input focus explicitly; the report prompt must directly answer it rather than only restating the project objective.
- Reviewers already receive the same focus; report mode passes it through writer → writer reviewer.

## 0.10.1 — 2026-11-23

- Added **导出 PDF** on reports: a print-ready A4 academic layout opens the browser print dialog, which can be saved as PDF with CJK fonts and figure plans.

## 0.10.0 — 2026-11-23

- Simplified the Sources tab to only **添加科研内容** and a paper count; discovery/analysis happen in the background after adding.
- Removed the experiment tab; **报告生成** now has one focus input, one generate button, and the generated report list/detail.
- Report mode of the pipeline runs writer + dedicated writer reviewer without re-running grabber/analysis.
- Writer loads `skills/scientific-writing` and `skills/scientific-figures`; reports include a figure plan.
- Added `docs/ARCHITECTURE.md` with the plugin's agent/pipeline topology.

## 0.9.0 — 2026-11-23

- Moved orchestration into the plugin itself: no conversation preset is required. The panel now has **运行完整研究流程**, backed by `pipeline.start` / `sci_pipeline`.
- Built-in stages: grabber → analysis → evidence reviewer → writer → dedicated writer reviewer.
- Added a writer-specific reviewer (`sci_review action=writer`) that judges the manuscript at research-paper level: contribution, evidence, citations, structure, limitations, and publishability.
- Removed the integrated Superagent preset; the plugin is a standalone panel workflow again.

## 0.8.1 — 2026-11-23

- The Research Supervisor now chooses the pipeline itself: users ask for research in natural language; the scheduler infers which stages are needed, skips completed stages, and dispatches the batch without asking for role names or pipeline confirmation.
- Progress messages are user-facing; internal route labels stay in the briefs.

## 0.8.0 — 2026-11-23

- Integrated the **科研 Superagent** preset into the plugin's own `cordis.patch.yml`; it no longer needs a separate preset bundle.
- The preset registers the scheduler persona and routing rules; `dsh-mini-superagent` remains the companion dispatch runtime.
- Added `sci_review` for independent, context-free evidence/report review at temperature 0.

## 0.7.0 — 2026-11-23

- Added `sci_review`: an independent evidence/report reviewer call with no conversation context and temperature 0. It returns approve/score, evidence merge/delete/add recommendations, citation issues, and required fixes.
- Added the companion `dsh-sci-superagent` preset: a Research Supervisor that dispatches grabber → analysis → reviewer → writer → report-reviewer as independent child sessions through `dsh-mini-superagent`. The scheduler briefs each role; reviewers are fresh subagents and report requirements are part of their rubric.
- The panel remains the shared ledger; subagents use the same `sci_*` tools.

## 0.6.2 — 2026-11-20

- Query expansion now enforces 2–4 word phrases; long concatenated phrases were returning zero arXiv hits.
- Providers run sequentially with retry/backoff, page sizes are capped at 100, Crossref is paginated in 25-item pages, and a native `fetch` fallback is used when the host web service rejects/truncates a JSON response.
- This makes 100-source discovery more reliable when a provider rate-limits or returns an unsupported content type.

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
