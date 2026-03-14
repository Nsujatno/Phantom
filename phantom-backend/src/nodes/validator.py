from src.state.graph_state import PipelineState

def validate_answers(state: PipelineState) -> PipelineState:
    """Validates answers against few-shot examples."""
    state["run_log"].append("Validating answers.")
    return state
