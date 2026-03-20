from pathlib import Path
from tenacity import retry, stop_after_attempt, wait_exponential

from langchain_google_genai import ChatGoogleGenerativeAI
from src.state.graph_state import PipelineState
from src.models.schemas import JobScore, ScoredJob, Job
from src.core.config import settings


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
Full Description: {job.get('full_description', 'N/A')}

Scoring Rubric (Total 100 points):
- Skill overlap with resume (0-33 points)
- Years of experience required (0-33 points)
- Tech stack match (0-34 points)

Calculate the points for each category based on how well the candidate matches the job listing.
Sum them up for the `overall_score`. Provide a brief reasoning for your scores.
"""
    structured_llm = llm.with_structured_output(JobScore)
    result = structured_llm.invoke(prompt)
    return result


def score_jobs(state: PipelineState) -> PipelineState:
    """Scores the current_job_dict against the resume."""
    job_dict = state.get("current_job_dict")
    if not job_dict:
        print("No current job to score.")
        return state

    print(f"--- Scoring: {job_dict.get('title')} @ {job_dict.get('company')} ---")

    # Load resume
    resume_path = Path(__file__).parent.parent.parent / "resume.txt"
    try:
        resume_text = resume_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print("resume.txt not found!")
        state["run_log"].append("Scoring failed: resume.txt missing.")
        state["current_score"] = None
        return state

    # Initialize Gemini
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash-lite",
            api_key=settings.GEMINI_API_KEY,
            temperature=1,
        )
    except Exception as e:
        print(f"Failed to initialize Gemini LLM: {e}")
        state["run_log"].append("Scoring failed: LLM init error.")
        state["current_score"] = None
        return state

    try:
        score: JobScore = get_job_score(llm, resume_text, job_dict)
        state["current_score"] = score

        if score.overall_score >= 10:
            print(f"  -> Passed! (Score: {score.overall_score})")
            job_obj = Job(
                title=job_dict.get("title", ""),
                company=job_dict.get("company", ""),
                url=job_dict.get("url", ""),
            )
            state["current_job"] = job_obj
            scored_job = ScoredJob(job=job_obj, score=score)
            state["scored_jobs"].append(scored_job)
        else:
            print(f"  -> Filtered. (Score: {score.overall_score})")
            state["current_job"] = None

    except Exception as e:
        print(f"  -> Failed to score: {e}")
        state["run_log"].append(f"Error scoring {job_dict.get('title')}: {e}")
        state["current_score"] = None
        state["current_job"] = None

    state["run_log"].append(
        f"Scored: {job_dict.get('title')} — {state.get('current_score').overall_score if state.get('current_score') else 'Error'}"
    )
    return state
