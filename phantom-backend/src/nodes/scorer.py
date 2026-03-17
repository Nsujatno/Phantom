import os
from pathlib import Path
from pydantic import ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential

from langchain_google_genai import ChatGoogleGenerativeAI
from src.state.graph_state import PipelineState
from src.models.schemas import JobScore, ScoredJob, Job
from src.core.config import settings

# Mock Notion Logger
def log_to_notion_mock(job: dict, status: str, score: JobScore | None = None):
    """
    Mocks the requirement to 'log to Notion immediately'.
    In a real implementation, this would use the Notion API.
    """
    title = job.get("title", "Unknown")
    company = job.get("company", "Unknown")
    score_val = score.overall_score if score else "N/A"
    print(f"[NOTION MOCK] Logged Job: {title} @ {company} | Status: {status} | Score: {score_val}")


# Retry up to 3 times on general exceptions or Pydantic validation errors
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def get_job_score(llm: ChatGoogleGenerativeAI, resume_text: str, job: dict) -> JobScore:
    prompt = f"""
You are an expert technical recruiter and hiring manager.
Please score the following job listing against the provided resume based on the exact criteria below.

Resume:
{resume_text}

Job Listing:
Title: {job.get('title')}
Company: {job.get('company')}
Description Snippet: {job.get('description_snippet', 'N/A')}

Scoring Rubric (Total 100 points):
- Skill overlap with resume (0-33 points)
- Years of experience required (0-33 points)
- Tech stack match (0-34 points)

Calculate the points for each category based on how well the candidate matches the job listing snippet. 
Sum them up for the `overall_score`. Provide a brief reasoning for your scores.
"""
    # .with_structured_output ensures it returns a JobScore Pydantic object
    structured_llm = llm.with_structured_output(JobScore)
    result = structured_llm.invoke(prompt)
    return result


def score_jobs(state: PipelineState) -> PipelineState:
    """Scores jobs against resume and filters them."""
    state["run_log"].append("Scoring jobs started.")
    print("\n--- Scoring Jobs ---")
    
    raw_jobs = state.get("raw_job_listings", [])
    if not raw_jobs:
        print("No raw jobs to score.")
        return state

    # Load resume
    resume_path = Path(__file__).parent.parent.parent / "resume.txt"
    try:
        resume_text = resume_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print("resume.txt not found! Please create it in the phantom-backend root.")
        state["run_log"].append("Scoring failed: resume.txt missing.")
        return state

    # Initialize Gemini
    # Ensure GEMINI_API_KEY is in the environment
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash", # fallback to flash since flash-lite might not be available in all regions or might have a different identifier
            api_key=settings.GEMINI_API_KEY,
            temperature=0.1
        )
    except Exception as e:
        print(f"Failed to initialize Gemini LLM: {e}")
        state["run_log"].append("Scoring failed: LLM init error.")
        return state

    scored_jobs_list = []
    
    for job_dict in raw_jobs:
        try:
            print(f"Scoring: {job_dict.get('title')} @ {job_dict.get('company')}...")
            score: JobScore = get_job_score(llm, resume_text, job_dict)
            
            if score.overall_score >= 80:
                print(f"  -> Passed! (Score: {score.overall_score})")
                log_to_notion_mock(job_dict, "Pending", score)
                
                # Convert to Pydantic objects for the state
                job_obj = Job(
                    title=job_dict.get("title", ""),
                    company=job_dict.get("company", ""),
                    url=job_dict.get("url", "")
                )
                scored_job = ScoredJob(job=job_obj, score=score)
                scored_jobs_list.append(scored_job)
            else:
                print(f"  -> Filtered. (Score: {score.overall_score})")
                log_to_notion_mock(job_dict, "Filtered", score)

        except Exception as e:
            print(f"  -> Failed to score: {e}")
            log_to_notion_mock(job_dict, "Error Scoring")
            state["run_log"].append(f"Error scoring {job_dict.get('title')}: {e}")

    state["scored_jobs"].extend(scored_jobs_list)
    state["run_log"].append(f"Scoring complete. {len(scored_jobs_list)} jobs passed.")
    print(f"--- Scoring Complete. {len(scored_jobs_list)} passed. ---")
    
    # We clear the raw_job_listings to signify they have been processed
    state["raw_job_listings"] = []

    return state
