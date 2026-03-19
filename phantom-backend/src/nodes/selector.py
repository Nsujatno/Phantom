from src.state.graph_state import PipelineState


def select_next_job(state: PipelineState) -> PipelineState:
    """
    Pops the first job from enriched_job_listings and sets it as the
    current_job to be processed in the per-job loop.
    Sets current_job to None when the list is empty, signalling loop end.
    """
    jobs = state.get("enriched_job_listings", [])

    if jobs:
        # Pop the first job off the list
        current = jobs[0]
        state["enriched_job_listings"] = jobs[1:]
        state["current_job_dict"] = current
        state["current_job"] = None  # will be set after scoring
        print(f"\n--- Selecting Job: {current.get('title')} @ {current.get('company')} ---")
    else:
        state["current_job_dict"] = None
        state["current_job"] = None
        print("\n--- No more jobs. Pipeline complete. ---")

    # Reset per-job state
    state["form_fields"] = []
    state["drafted_answers"] = []
    state["validation_result"] = None
    state["current_score"] = None

    return state
