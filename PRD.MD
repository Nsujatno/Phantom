# Phantom — Product Requirements Document

## Overview

Phantom is a fully autonomous pipeline that scrapes job listings, scores them against your resume, drafts open-ended application answers in your voice, and submits applications via a custom Chrome extension — all without manual intervention. A Notion database serves as a real-time log of everything the agent does.

---

## Goals

- Automate the entire job application process end-to-end
- Demonstrate a production-grade agentic pipeline with LangGraph, Pydantic validation, and LLM tool use
- Provide live visual feedback via a Chrome extension popup during demo
- Log all activity to Notion for transparency and review

---

## Non-Goals

- This is not a job board aggregator or search tool
- This does not support manual application workflows
- This does not target LinkedIn (v1 scope)

---

## Architecture Overview

### Pipeline Flow

1. **"Look" (Search Scan)**: User triggers action on Indeed; extension performs a quick scan of search results (titles/URLs).
2. **Identification & Batch Prep**: Extension sends batch of raw URLs to backend; backend creates "Pending" entries in Notion for deduplication.
3. **"Leap" (Sequential Deep-Dive)**: For each "Pending" job, the extension autonomously opens the direct job URL in a background/foreground tab.
4. **Scoring (High Fidelity)**: While on the job page, extension extracts *full* description/DOM. **Scorer node** gives a definitive 0–100 score. Extension shows a "Phantom is analyzing..." spinner.
5. **Conditional Pivot**:
    - Score < 80 → End (Notion updated to "Filtered"). Extension closes tab, moves to next job.
    - Score >= 80 → Notion updated to "Applying". Pipeline continues.
6. **Form Detection**: Extension captures form fields/DOM from the active application page.
7. **Drafter node**: Generates answers to open-ended questions using the full job context.
8. **Validator node**: Checks answers against few-shot style examples.
9. **Submission node**: Extension fills and clicks "Submit" autonomously.
10. **Logger node**: Notion updated to "Applied" or "Failed" with timestamp.

### Kill Switch

- Stop button lives in the Chrome extension popup
- On trigger: finishes current application, then halts the WebSocket pipeline processing
- FastAPI server exposes endpoints/WebSocket events to handle stoppage
- Pipeline status tracked by the WebSocket Manager/Orchestrator

---

## LangGraph State Object (Single-Job Scope)

```python
from typing import TypedDict
from pydantic import BaseModel

class JobApplicationState(TypedDict):
    job: dict  # The raw job from the extension
    score: 'JobScore' | None
    status: str  # e.g., "pending", "filtered", "flagged", "applied"
    form_fields: list[str]
    drafted_answers: list['DraftedAnswer']
    validation_result: 'ValidationResult' | None
    run_log: list[str]
```

---

## LangGraph Nodes

| Node | Responsibility |
|---|---|
| Scorer | Gemini 2.5 Flash Lite scores each job, logs to Notion immediately |
| Router | Conditional edge — drops jobs below 80, passes rest to drafter |
| Drafter | Extension reads DOM, Gemini 2.5 Flash generates answers per field |
| Validator | Gemini 2.5 Flash checks answers against few-shot examples |
| Submission | Extension fills and submits form |
| Logger | Writes final application status to Notion (both successful and filtered jobs) |

### Conditional Edges

- Score < 80 → routes to Logger (logged as "Filtered"), then End
- Validator status = "flagged" → skip submission, route to Logger (logged as "Flagged"), then End
- Pipeline status = "stopped" → finish current job, halt

---

## LLM Architecture

### Models

| Node | Model |
|---|---|
| Scorer | Gemini 2.5 Flash Lite |
| Drafter | Gemini 2.5 Flash |
| Validator | Gemini 2.5 Flash |

### Pydantic Output Models

```python
class JobScore(BaseModel):
    skill_overlap_score: int       # 0–33
    experience_score: int          # 0–33
    tech_stack_score: int          # 0–34
    overall_score: int             # 0–100
    reasoning: str

class DraftedAnswer(BaseModel):
    question: str
    answer: str
    confidence: float

class ValidationResult(BaseModel):
    status: Literal["pass", "fail", "flagged"]
    reasoning: str
    flagged_answers: list[str]
```

All LLM outputs are Pydantic validated. On validation failure, retry up to 3 times before logging as error.

### Tone Validation

- Validator receives drafted answers + hand-written few-shot examples from Nathan
- Few-shot examples serve as the style reference
- If validation fails → log job as "Flagged" in Notion, skip submission

---

## Scoring Criteria

| Factor | Weight |
|---|---|
| Skill overlap with resume | 33 pts |
| Years of experience required | 33 pts |
| Tech stack match | 34 pts |
| **Total** | **100 pts** |

Threshold to proceed: **80+**

---

## Chrome Extension

### Responsibilities

- **Sequential Navigation**: Responsible for opening job URLs one by one and maintaining focus.
- **Thinking UI**: Must display a non-blocking spinner/overlay (e.g., "Phantom is analyzing requirements...") when LLM nodes are processing to prevent "frozen" perception.
- **High-Fidelity Context**: Captures full page DOM/HTML *after* clicking into the job, ensuring Scorer has 100% of the job text.
- **Form Handling**: Receives filled answers and interacts with submission buttons.

### Communication

- Extension ↔ Backend via local FastAPI server
- Extension polls Notion directly for job queue
- FastAPI exposes `/status`, `/stop`, `/answers` endpoints

### Popup UI

| Element | Description |
|---|---|
| Header | "Auto Job Agent" |
| Status line | "Analyzing [Job]..." | "Applying to [Job]..." |
| Feedback | Spinner while Gemini works | Progress bar/logs |
| Counter | "X jobs applied today" | Total successful submissions |
| Stop button | Red — finishes current app then halts pipeline |

### Form Field Detection

- Extension captures full page DOM/HTML
- Sends to Gemini via FastAPI
- Gemini returns structured field → answer mapping (Pydantic validated)
- Works dynamically on any job site — no hardcoded CSS selectors

---

## Notion Schema

### Database Columns

| Column | Type | Description |
|---|---|---|
| Job Title | Title | Role name |
| Company | Text | Company name |
| Job URL | URL | Direct link to posting |
| Skill Overlap Score | Number | 0–33 |
| Experience Score | Number | 0–33 |
| Tech Stack Score | Number | 0–34 |
| Overall Score | Number | 0–100 |
| Drafted Answers | Text | JSON blob of Q&A pairs |
| Application Status | Select | See status flow below |
| Date Found | Date | When scraped |
| Date Applied | Date | When submitted |

### Status Flow

```
Pending → Applied
       → Filtered (score < 80)
       → Flagged (validator rejected)
       → Failed (submission error)
```

### Deduplication

Before processing any job, query Notion by URL. If URL already exists in any status, skip.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Orchestration | LangGraph (Single-Job graphs) |
| Communication | WebSockets (Backend ↔ Extension) |
| LLM | Gemini 2.5 Flash / Flash Lite |
| Output validation | Pydantic |
| Backend server | FastAPI (local) |
| Scraping / Forms | Custom Chrome Extension |
| Logging | Notion API |

---

## Infrastructure

- **v1**: Runs locally on Nathan's machine
- **v2**: Host backend on Railway or Render free tier
- **Cost**: ~$1–5/month (Gemini API only, all other tools free)

---

## Job Search Parameters

| Parameter | Value |
|---|---|
| Job board | Indeed |
| Job title | Software Engineer |
| Experience level | Internship + New Grad / Entry Level |
| Hard filters | None (v1) |
| Score threshold | 80+ |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Pydantic validation fails | Retry up to 3 times, then log error |
| Scraper returns no results | Log warning, end run |
| Extension cannot read DOM | Log as "Failed", move to next job |
| Form submission fails | Log as "Failed" in Notion |
| Kill switch triggered | Finish current application, halt pipeline |

---

## Portfolio Positioning

This project demonstrates:
- Multi-node LangGraph agentic pipeline with typed state
- Pydantic-enforced LLM output validation at every node
- Real browser automation via custom Chrome extension (CDP)
- Dynamic DOM understanding via LLM (no hardcoded selectors)
- End-to-end autonomous pipeline with live visual feedback
- Notion as structured logging layer for agent observability