from pydantic import BaseModel, ConfigDict, Field, field_validator
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
    model_config = ConfigDict(str_strip_whitespace=True)

    phantom_id: str
    name: str | None = None
    type: str
    value: str | None = None
    placeholder: str | None = None
    label: str = Field(min_length=1)   # "__needs_inference__" when html_snippet is set
    required: bool | None = False
    options: list[str] | None = None
    html_snippet: str | None = None    # sanitized outerHTML for label inference by LLM

    @field_validator("label")
    @classmethod
    def label_must_not_be_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("label must not be empty")
        return value

class ApplyStepRequest(BaseModel):
    page_url: str | None = None
    page_title: str | None = None
    fields: list[SerializedField]

class ApplyStepResponse(BaseModel):
    page_type: Literal["form", "review", "success", "unknown"] | None = None
    reasoning: str | None = None
    answers: dict[str, str | bool | list[str]]
    next_action_id: str | None = None
    upload_resume: bool = False
    upload_field_id: str | None = None
