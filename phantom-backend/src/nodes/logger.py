from src.state.graph_state import PipelineState
from src.services.notion_service import NotionService

notion = NotionService()


def log_to_notion(state: PipelineState) -> PipelineState:
    """
    Logs the current job's final state to Notion.
    Determines status from current_score and validation_result.
    """
    job_dict = state.get("current_job_dict")
    if not job_dict:
        state["run_log"].append("Logger: No current job to log.")
        return state

    score = state.get("current_score")
    validation = state.get("validation_result")

    # Determine status
    if not score or score.overall_score < 80:
        status = "Filtered"
    elif validation and validation.status == "fail":
        status = "Validation Failed"
    elif validation and validation.status == "flagged":
        status = "Flagged"
    elif state.get("applied_successfully"): # Placeholder for future application step
        status = "Applied"
    else:
        status = "Pending"

    notion.log_job(
        job=job_dict,
        status=status,
        score=score,
        drafted_answers=state.get("drafted_answers"),
        date_applied=state.get("date_applied"), # Pass if provided in state
    )

    state["run_log"].append(
        f"Logged to Notion: {job_dict.get('title')} @ {job_dict.get('company')} -> {status}"
    )
    return state
