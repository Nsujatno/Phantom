from datetime import datetime
from typing import TypedDict, Literal
from src.models.schemas import ScoredJob, Job, JobScore

class PipelineState(TypedDict):
    raw_job_listings: list[dict]
    enriched_job_listings: list[dict]
    scored_jobs: list[ScoredJob]
    current_job: Job | None           # Pydantic Job object for the current job
    current_job_dict: dict | None     # Raw enriched dict for the current job
    current_score: JobScore | None    # Score for the current job (set after scoring)
    form_fields: list[str]
    application_status: Literal["success", "failure", "skipped", "pending"] | None
    date_applied: datetime | None             # Date the application was sent
    run_log: list[str]
    pipeline_status: Literal["running", "stopped"]
