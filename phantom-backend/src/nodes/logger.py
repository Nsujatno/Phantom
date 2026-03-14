from src.state.graph_state import PipelineState

def log_to_notion(state: PipelineState) -> PipelineState:
    """Logs the final application status to Notion."""
    state["run_log"].append("Logging to Notion.")
    return state
