# Phantom Architecture & Folder Structure

## Understanding Summary
*   **What is being built:** "Phantom" — a fully autonomous, LangGraph-orchestrated job application pipeline that handles scraping (via Chrome Extension), resume scoring, answer drafting, and form submission.
*   **Why it exists:** To completely automate the job hunting process for Software Engineer roles with strict Pydantic validation, agentic reasoning, and high observability.
*   **Who it is for:** Personal use (starting as a local tool, with plans to host the backend in v2).
*   **Key constraints:** Integrating a custom Chrome Extension (for scraping and DOM reading/submission) with a local FastAPI backend via WebSockets. Relies on LangGraph for state management, Notion API for logging, and Gemini 2.5 for reasoning.
*   **Explicit non-goals:** Not targeting LinkedIn in v1, no manual application flows, and not a generic job board aggregator.

## Assumptions
*   **Database/State Layer:** No persistent local database is required for v1; in-memory LangGraph state and Notion logs are sufficient.
*   **Node Modularization:** The backend logic should be cleanly separated by LangGraph node responsibility to allow for easy scaling and additions.

## Decision Log

| Decision | Alternatives Considered | Rationale |
| :--- | :--- | :--- |
| **Decoupled Repositories** | Monorepo (backend and extension in one root). | Keeps backend deployment separate from the client (extension), enforcing a strict API boundary and simplifying the mental model. |
| **Plasmo Framework (React)** | Standard React + Webpack/Vite custom config. | Provides a "Next.js-like" developer experience for Chrome extensions with out-of-the-box hot reloading and simplified manifest management. Avoids fragile custom Webpack configurations for extensions. |
| **`src/` Layout for Backend** | Flat structure (no `src/` directory). | Standard Python best practice. Prevents import errors during testing, keeps the root directory clean of configuration files, and separates application logic strictly. |

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
