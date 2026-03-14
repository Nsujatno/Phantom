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
