from src.state.graph_state import PipelineState

def scrape_jobs(state: PipelineState) -> PipelineState:
    """Scrapes Indeed using Crawl4AI."""
    state["run_log"].append("Scraping started.")
    return state
