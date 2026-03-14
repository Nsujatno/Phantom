from src.state.graph_state import PipelineState

def draft_answers(state: PipelineState) -> PipelineState:
    """Drafts answers based on DOM elements."""
    state["run_log"].append("Drafting answers.")
    return state
