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

1. **User Chrome Extension Action** triggers the scrape on Indeed (or supported job boards).
2. **Extension** extracts an array of raw job listings and sends them to the backend via WebSockets.
3. **WebSocket Manager (Orchestrator)** receives the array and, for each job, spawns an isolated LangGraph execution.
4. **Deduplication check** (within graph) queries Notion — skips any job URL already logged.
5. **Scorer node** scores the job 0–100 against resume — drops anything below 80.
6. **Extension** opens the job URL in real Chrome, reads the DOM, sends form fields to backend.
7. **Drafter node** generates answers to open-ended questions per field.
8. **Validator node** checks answers against few-shot style examples.
9. **Submission node** extension fills and submits the form.
10. **Logger node** writes final status back to Notion.

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
| Logger | Writes final application status to Notion |

### Conditional Edges

- Score < 80 → end (logged as "Filtered" in Notion)
- Validator status = "flagged" → skip submission, log as "Flagged", move to next job
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

- Poll Notion for jobs ready for application
- Open job URLs in real Chrome tab
- Read DOM and send form fields to FastAPI backend
- Receive filled answers from backend
- Fill and submit form autonomously
- Update Notion status to "Applied" or "Failed" after submission

### Communication

- Extension ↔ Backend via local FastAPI server
- Extension polls Notion directly for job queue
- FastAPI exposes `/status`, `/stop`, `/answers` endpoints

### Popup UI

| Element | Description |
|---|---|
| Header | "Auto Job Agent" |
| Status line | "Applying to [Job Title] @ [Company]" |
| Counter | "X jobs applied today" |
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