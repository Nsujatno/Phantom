from pydantic import BaseModel
from typing import Literal

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
    
class Job(BaseModel):
    title: str
    company: str
    url: str

class ScoredJob(BaseModel):
    job: Job
    score: JobScore

class SerializedField(BaseModel):
    phantom_id: str
    name: str | None = None
    type: str
    value: str | None = None
    placeholder: str | None = None
    label: str | None = None
    required: bool | None = False
    options: list[str] | None = None

class ApplyStepRequest(BaseModel):
    page_url: str | None = None
    page_title: str | None = None
    fields: list[SerializedField]

class ApplyStepResponse(BaseModel):
    page_type: Literal["form", "review", "success", "unknown"] | None = None
    reasoning: str | None = None
    answers: dict[str, str | bool | list[str]]
    next_action_id: str | None = None
