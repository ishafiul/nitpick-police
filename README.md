## Commit PR — Local‑First AI Code Review CLI

A fast, local‑first CLI for intelligent code review with state tracking. It retrieves the most relevant code context from your repo (optionally using a local vector DB), composes a compact prompt, and—only on demand—escalates to a cloud LLM for high‑quality review.

- Local‑first retrieval and composition
- Explicit cloud calls (Anthropic) for actual reviews
- Optional Qdrant vector store for code/insight indexing
- Review storage and browsing

## Requirements

- Node.js ≥ 18
- npm (or pnpm/yarn)
- Optional: Docker (to run Qdrant locally)
- Optional: Anthropic API key for cloud reviews (`cloud_llm.api_key`)

## Quick Start

### Install & Build (local checkout)

```bash
# Build first
npm run build

# Then install globally
npm install -g .

# Make the main entry point executable
chmod +x dist/index.js
```

### Initialize config

```bash
# Minimal
np init

# With explicit providers
np init \
  --anthropic-key "<YOUR_ANTHROPIC_API_KEY>" \
  --qdrant-url "http://localhost:6333" \
  --ollama-url "http://localhost:11434"
```

This creates `.code_review/config.json` using sensible defaults. You can re‑run `init` to update settings.

### (Optional) Run Qdrant locally

```bash
docker run -p 6333:6333 qdrant/qdrant:latest
```

Then validate:

```bash
np qdrant-test  # if registered in your build; otherwise skip
```

## Configuration

- Project config: `.code_review/config.json`
- Key sections you may care about:
  - `cloud_llm`: model, temperature, max_tokens, `api_key`
  - `local_llm`: Ollama base URL and model
  - `qdrant`: URL and collections
  - `retrieval`: `default_top_k`, `max_retrieval_tokens`
  - `prompt_composition`: token budget and allocation

You can view or edit via the `config` command (see below), or modify the file directly.

## CLI Usage

All commands below are invoked as:

```bash
np <command> [options]
```

Run `--help` on any command to see full options.

### Global flags

- `--verbose`: extra logging
- `--json`: JSON output when supported
- `--no-color`: disable colors

---

### init
Initialize code review configuration for the project.

Examples:
```bash
np init
np init --anthropic-key "sk-ant-..." --qdrant-url http://localhost:6333
```

---

### config
Show or manage configuration values. Supports viewing sections or entire config.

Examples:
```bash
np config --show
np config --get qdrant.url
np config --set qdrant.url http://localhost:6333
```

---

### status
Show current review/indexing status for this repo.

```bash
np status
```

---

### list
List stored reviews.

```bash
np list --limit 20 --json
```

---

### show
Show a specific stored review in detail.

```bash
np show <reviewId>
```

---

### mark-resolved
Mark review comments as resolved.

```bash
np mark-resolved --id <reviewId> [--all]
```

---

### index-history
Index repository history (commit summaries) for richer retrieval.

```bash
np index-history --since HEAD~50
```

---

### search
Retrieve the most relevant code chunks using hybrid semantic search.

Common options:
- `-f, --file <path>`: limit to a file
- `-d, --directory <dir>`: limit to a directory
- `-l, --language <lang>`: filter by language
- `-t, --type <type>`: chunk type (function, class, method, ...)
- `-k, --top-k <n>`: results to return (default 10)
- `--page/--page-size`: paginate output
- `--max-tokens <n>`: token budget for retrieved content (client‑side trim)
- `--dry-run`: print the built query and exit

Examples:
```bash
np search "debounce implementation" -l typescript -k 15 --page 1 --page-size 10
np search "auth middleware bug" --directory src/server --max-tokens 3000 --dry-run
```

---

### search-file
Search within a specific file.

```bash
np search-file src/utils/tokens.ts "estimate"
```

---

### search-stats
Show retrieval system statistics (Qdrant collections, service config).

```bash
np search-stats --verbose
```

---

### compose
Compose a compact, structured prompt from retrieved code context. This does not call a cloud model unless you later pass it to `review`.

Common options:
- Retrieval scoping: `--file`, `--directory`, `--language`, `--type`, `--top-k`, `--min-score`
- Prompt controls: `--token-budget`, `--max-issues`, `--guidelines <file>`, `--commit-from/--commit-to`
- Modes: `--preview` (estimate), `--dry-run` (print planned composition), `--output <file>` (save prompt)

Examples:
```bash
np compose "review core query builder" --directory src/services --token-budget 6000 --preview
np compose "security review" --file src/server/auth.ts --output .code_review/prompts/auth.json
```

---

### review
Generate a cloud review using a composed prompt (prepared file) or a direct, on‑the‑fly workflow.

Two modes:
1) From prepared prompt
```bash
np review --from-prepared .code_review/prompts/auth.json --dry-run
np review --from-prepared .code_review/prompts/auth.json --store --extract-insights
```

2) Direct cloud workflow (retrieval → composition → review)
```bash
np review --file src/server/auth.ts --top-k 8 --budget 8000 --include-insights
np review --since HEAD~5 --budget 9000 --include-diffs --store
```

Common options:
- `--model`, `--temperature`, `--max-tokens`, `--timeout`
- `--format text|json|table`
- `--dry-run` (print configuration and prompt preview, no API call)
- `--store` (save results locally and in Qdrant); `--extract-insights` (store issue‑level insights)

## Typical Workflow

1) Initialize config: `np init`
2) (Optional) run Qdrant via Docker
3) Explore repo with `np search` / `np search-file` / `np search-stats`
4) Compose prompt with `np compose` (preview/dry-run to size)
5) Call `np review` (dry‑run first, then real run)
6) View results with `np list`/`np show`; resolve comments with `np mark-resolved`

## Troubleshooting

- "Cannot reach Qdrant": Start Qdrant (`docker run -p 6333:6333 qdrant/qdrant`) and verify URL in `.code_review/config.json`.
- "Cloud LLM configuration not found": Ensure `cloud_llm.api_key` is set (run `np init` with `--anthropic-key` or edit config).
- Timeouts: Increase `cloud_llm.timeout` or use `--timeout` on `np review`.

## Contributing / Dev

- TypeScript build: `npm run build`
- Run CLI locally: `np --help`
- Lint/format: `npm run lint` / `npm run format`

---

This project is designed to keep cloud calls deliberate and minimal while making local retrieval and prompt composition fast and reliable. If you need deeper integration (hooks, advanced indexing, or additional commands), open an issue or extend the services/modules under `src/services/` and `src/cli/commands/`.