from src.state.graph_state import PipelineState

def score_jobs(state: PipelineState) -> PipelineState:
    """Scores jobs against resume."""
    state["run_log"].append("Scoring jobs.")
    return state
