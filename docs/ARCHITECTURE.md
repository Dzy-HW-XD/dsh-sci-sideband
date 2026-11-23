# Architecture

```mermaid
flowchart TD
  UI[Sidebar Panel] -->|RPC /api/sci-sideband/call| LAB[ResearchLab]
  TOOLS[sci_* Agent Tools] --> LAB
  AUTO[Auto-scan / Timer] --> LAB

  LAB -->|web.fetch| WEB[arXiv / OpenAlex / Crossref / Europe PMC / DOAJ / Semantic Scholar]
  LAB -->|llm.stream| LLM[Configured chat model]

  LAB --> PIPE[Built-in Pipeline]
  PIPE --> G[Grabber<br/>discover + citation expansion]
  PIPE --> A[Analysis<br/>problem / method / achievements / critique / formulas]
  PIPE --> R1[Evidence Reviewer<br/>sci_review · temp 0 · no context]
  PIPE --> W[Writer<br/>scientific writing + figure skills]
  PIPE --> R2[Writer Reviewer<br/>paper-level rubric · temp 0 · no context]

  G --> STORE[(data.json + wiki/)]
  A --> STORE
  R1 --> STORE
  W --> STORE
  R2 --> STORE
  STORE --> UI
```

- No subagent sessions are required; the scheduler is a plugin method.
- `sci_pipeline` and the panel button call the same `pipeline.start` action.
- `sci_review` is a separate stateless reviewer call; writer and writer-reviewer are distinct stages.
