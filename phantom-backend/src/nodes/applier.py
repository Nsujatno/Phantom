from src.state.graph_state import PipelineState
from src.api.socket_manager import manager
import asyncio

async def apply_to_job(state: PipelineState) -> PipelineState:
    """Delegates the job application process to the Chrome extension."""
    job_dict = state.get("current_job_dict")
    if not job_dict:
        return state

    state["run_log"].append(f"Starting application for {job_dict.get('title')}.")
    print(f"\n--- Applying: {job_dict.get('title')} ---")

    url = job_dict.get("url")
    if not url:
        return state

    try:
        # Request extension to navigate and start applying
        # This will block until the extension sends a status message "apply_result"
        result = await manager.request_autonomous_apply(url)
        print(f"  -> Application result from extension: {result}")
        result_status = result.get("status")
        state["run_log"].append(f"Apply result: {result_status}")

        if result_status == "navigating":
            state["application_status"] = "pending"
        elif result_status in {"filled", "success"}:
            state["application_status"] = "success"
        else:
            state["application_status"] = "failure"
            print(f"  -> Failed/Skipped reason: {result.get('message', 'Unknown')}")
        
    except Exception as e:
        print(f"  -> Error leaping to apply to {job_dict.get('title')}: {e}")
        state["run_log"].append(f"Error applying to {job_dict.get('title')}: {e}")
        state["application_status"] = "failure"
    
    return state
