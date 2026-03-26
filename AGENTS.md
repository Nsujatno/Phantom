# Phantom Project Context

Phantom is an autonomous job application agent designed to automate the process of job hunting on platforms like Indeed. It utilizes a sequential "Look & Leap" architecture, where a Chrome extension orchestrates navigation and form interaction, while a FastAPI backend handles the intelligence (scoring, drafting, and validation) using LangGraph and Gemini LLMs.

## Project Structure

-   **`phantom-backend/`**: A Python-based FastAPI application using LangGraph for agent orchestration.
    -   **Tech Stack**: Python 3.11+, FastAPI, LangGraph, Pydantic, Gemini Flash/Lite, Notion SDK.
    -   **Key Nodes**: Scraper, Extractor, Scorer, Drafter, Validator, Logger.
-   **`phantom-extension/`**: A React-based Chrome extension built with the Plasmo framework.
    -   **Tech Stack**: React, TypeScript, Plasmo, Tailwind CSS.
    -   **Responsibilities**: Page navigation, DOM extraction, form filling, and user dashboard.

## Building and Running

### Backend (`phantom-backend/`)

1.  **Installation**: Ensure `uv` is installed, then run:
    ```bash
    uv sync
    ```
2.  **Configuration**: Create a `.env` file in `phantom-backend/` with the following keys:
    ```env
    NOTION_API_KEY=your_notion_key
    NOTION_DATABASE_ID=your_database_id
    GEMINI_API_KEY=your_gemini_key
    ```
3.  **Running**: From the `phantom-backend/` directory, run:
    ```bash
    python -m src.main
    ```
    The server will start at `http://localhost:8000`.

### Extension (`phantom-extension/`)

1.  **Installation**:
    ```bash
    npm install
    ```
2.  **Running (Development)**:
    ```bash
    npm run dev
    ```
3.  **Loading in Chrome**:
    -   Go to `chrome://extensions/`
    -   Enable "Developer mode".
    -   Click "Load unpacked".
    -   Select the `build/chrome-mv3-dev` directory.

## Development Conventions

-   **Backend**:
    -   Uses the `src/` layout for source code.
    -   LLM interactions are wrapped in Pydantic models for structured output validation.
    -   Agent workflows are managed via LangGraph nodes in `src/nodes/`.
    -   Centralized logging to Notion via `NotionService`.
-   **Extension**:
    -   Built with Plasmo for a modern development experience.
    -   Uses content scripts for interacting with job board DOMs.
    -   Communicates with the backend via a WebSocket orchestrator or standard HTTP endpoints.
- **Logging**: All agent actions and job application statuses are synced to a Notion database for real-time observability.

## Progress Log

### 2026-03-23
- **What we built**: Sequential "Super Autonomous" mode with "Look & Leap" hybrid scraping (batch search + high-fidelity navigation). Robust Chrome Extension extractor using `chrome.scripting`. Backend with Gemini 2.5 Flash, real-time Notion logging, and duplicate detection. Verified E2E flow from scraping to Notion syncing.
- **Next steps**: 
    1. Fix radio button context extraction.
    2. Orchestrate Drafter and Submission nodes for form filling.
    3. Add "Thinking" UI spinner to the extension.
    4. Implement tone validation in the `Validator` node.
    5. Complete Kill Switch UI.
