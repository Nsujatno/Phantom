from langgraph.graph import StateGraph, END
from src.state.graph_state import PipelineState
from src.nodes.scraper import scrape_jobs
from src.nodes.extractor import extract_job_details
from src.nodes.selector import select_next_job
from src.nodes.scorer import score_jobs
from src.nodes.applier import apply_to_job
from src.nodes.logger import log_to_notion


# --- Routing Functions ---

def route_after_select(state: PipelineState) -> str:
    """After selecting, if there's a job to process go to scoring, else end."""
    if state.get("current_job_dict") is not None:
        return "score"
    return END


def route_after_score(state: PipelineState) -> str:
    """
    If the job passed scoring (score >= 80), proceed to applying.
    Otherwise, skip to the logger to immediately log 'Filtered'.
    """
    if state.get("current_job") is not None:
        return "apply"
    return "log"


def route_after_log(state: PipelineState) -> str:
    """After logging, loop back to select the next job."""
    return "select"


# --- Build Graph ---

workflow = StateGraph(PipelineState)

# Nodes
workflow.add_node("scrape", scrape_jobs)
workflow.add_node("extract", extract_job_details)
workflow.add_node("select", select_next_job)
workflow.add_node("score", score_jobs)
workflow.add_node("apply", apply_to_job)
workflow.add_node("log", log_to_notion)

# Edges: batch phase
workflow.set_entry_point("scrape")
workflow.add_edge("scrape", "extract")
workflow.add_edge("extract", "select")

# Conditional: select -> score or END
workflow.add_conditional_edges(
    "select",
    route_after_select,
    {"score": "score", END: END},
)

# Conditional: score -> apply (passed) or log (filtered)
workflow.add_conditional_edges(
    "score",
    route_after_score,
    {"apply": "apply", "log": "log"},
)

# Linear: apply -> log
workflow.add_edge("apply", "log")

# Loop back: log -> select (next job)
workflow.add_conditional_edges(
    "log",
    route_after_log,
    {"select": "select"},
)

# Compile Graph
app = workflow.compile()
