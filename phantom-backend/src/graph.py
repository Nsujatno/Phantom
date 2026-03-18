from langgraph.graph import StateGraph, END
from src.state.graph_state import PipelineState
from src.nodes.scraper import scrape_jobs
from src.nodes.extractor import extract_job_details
from src.nodes.scorer import score_jobs
from src.nodes.drafter import draft_answers
from src.nodes.validator import validate_answers
from src.nodes.logger import log_to_notion

# Initialize Graph
workflow = StateGraph(PipelineState)

# Add Nodes
workflow.add_node("scrape", scrape_jobs)
workflow.add_node("extract", extract_job_details)
workflow.add_node("score", score_jobs)
workflow.add_node("draft", draft_answers)
workflow.add_node("validate", validate_answers)
workflow.add_node("log", log_to_notion)

# Add Edges (Linear for now, conditionals added later per PRD)
workflow.set_entry_point("scrape")
workflow.add_edge("scrape", "extract")
workflow.add_edge("extract", "score")
workflow.add_edge("score", "draft")
workflow.add_edge("draft", "validate")
workflow.add_edge("validate", "log")
workflow.add_edge("log", END)

# Compile Graph
app = workflow.compile()
