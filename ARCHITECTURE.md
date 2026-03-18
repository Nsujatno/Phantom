# Phantom Architecture & Folder Structure

## Understanding Summary
*   **What is being built:** "Phantom" — a high-fidelity, autonomous job application agent that uses a "Look & Leap" sequential architecture to scrape, score, and apply to jobs on Indeed.
*   **Why it exists:** To automate job hunting with 100% context parity (reading the full job page) and high observability via Notion.
*   **Who it is for:** Personal use (local FastAPI backend + Chrome Extension).
*   **Key constraints:** Sequential navigation (one job at a time) to ensure Gemini Scorer has the full job description. Real-time Notion updates for cross-session reliability.
*   **Explicit non-goals:** No bulk/batch scoring without full page context in v1. No LinkedIn support in v1.

## Assumptions
*   **Database/State Layer:** No persistent local database is required for v1; in-memory LangGraph state and Notion logs are sufficient.
*   **Node Modularization:** The backend logic should be cleanly separated by LangGraph node responsibility to allow for easy scaling and additions.

## Decision Log

| Decision | Alternatives Considered | Rationale |
| :--- | :--- | :--- |
| **Decoupled Repositories** | Monorepo (backend and extension in one root). | Keeps backend deployment separate from the client (extension), enforcing a strict API boundary and simplifying the mental model. |
| **Plasmo Framework (React)** | Standard React + Webpack/Vite custom config. | Provides a "Next.js-like" developer experience for Chrome extensions with out-of-the-box hot reloading. |
| **"Look & Leap" Architecture** | Batch Scraping (scoring snippets from search results). | Sequential navigation ("Leaping") to each job page ensures the Gemini Scorer has 100% context. Batch scoring often misses fine-print requirements found only on the full job page. |
| **`src/` Layout for Backend** | Flat structure (no `src/` directory). | Standard Python best practice. Prevents import errors and separates logic strictly. |

---

## Final Design: Folder Structures

### Phantom Backend (Python / FastAPI / LangGraph)

```text
phantom-backend/
├── src/
│   ├── api/                 # FastAPI server and endpoints
│   │   ├── __init__.py
│   │   ├── routes.py        # POST /status, /stop, /answers
│   │   └── socket_manager.py # WebSocket Orchestrator for extension comms
│   ├── core/                # Configuration and setup
│   │   ├── __init__.py
│   │   └── config.py        # Env vars, Notion IDs, API keys
│   ├── models/              # Data structures
│   │   ├── __init__.py
│   │   └── schemas.py       # Pydantic models (JobScore, DraftedAnswer, ValidationResult)
│   ├── state/               # LangGraph state management
│   │   ├── __init__.py
│   │   └── graph_state.py   # JobApplicationState TypedDict definition (Single-Job)
│   ├── nodes/               # LangGraph operational nodes
│   │   ├── __init__.py
│   │   ├── scorer.py        # Gemini Flash Lite resume scoring
│   │   ├── drafter.py       # Gemini Flash answer generation
│   │   ├── validator.py     # Gemini Flash tone/logic validation
│   │   └── logger.py        # Notion API integration
│   ├── graph.py             # LangGraph compilation (edges, conditional logic)
│   └── main.py              # Application entry point
├── tests/                   # Pytest directory
├── .env                     # Local environment variables
└── pyproject.toml           # Dependency management (uv/poetry)
```

### Phantom Extension (React / Plasmo / TypeScript)

```text
phantom-extension/
├── src/
│   ├── background/
│   │   └── index.ts         # Service Worker: Polling Notion, managing background lifecycle
│   ├── contents/
│   │   ├── extractor.ts     # Injects into job sites: Reads DOM context, sends to backend
│   │   └── filler.ts        # Injects into job sites: Receives backend answers, fills forms
│   ├── popup/
│   │   ├── index.tsx        # Main UI component (Auto Job Agent dashboard)
│   │   └── styles.css       # Tailwind/global CSS imports
│   ├── components/          # Reusable React UI elements
│   │   ├── StatusCard.tsx   # Displays active job and progression
│   │   └── StopButton.tsx   # The pipeline kill switch
│   └── lib/                 # Utilities and SDK wrappers
│       ├── api.ts           # Fetch wrappers talking to localhost FastAPI
│       ├── notion.ts        # Notion API wrappers (if extension talks directly)
│       └── types.ts         # TypeScript definitions mirroring Python Pydantic models
├── assets/                  # Icons (e.g., icon512.png)
├── .env                     # Local environment variables
├── package.json             # Node dependencies and Plasmo config
└── tsconfig.json            # TypeScript configuration
```
