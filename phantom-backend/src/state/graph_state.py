from typing import TypedDict, Literal
from src.models.schemas import ScoredJob, Job, DraftedAnswer, ValidationResult

class PipelineState(TypedDict):
    raw_job_listings: list[dict]
    scored_jobs: list[ScoredJob]
    current_job: Job | None
    form_fields: list[str]
    drafted_answers: list[DraftedAnswer]
    validation_result: ValidationResult | None
    run_log: list[str]
    pipeline_status: Literal["running", "stopped"]
