from src.state.graph_state import PipelineState
from src.api.socket_manager import manager

async def scrape_jobs(state: PipelineState) -> PipelineState:
    """LangGraph node: Scrapes Indeed using the Chrome Extension via WebSocket."""
    search_url = "https://www.indeed.com/jobs?q=Software+Engineer&explvl=entry_level"

    state["run_log"].append("Scraping started via Chrome Extension.")
    print("Requesting scrape from Chrome Extension...")

    try:
        jobs = await manager.request_scrape(search_url)
        state["raw_job_listings"] = jobs
        state["run_log"].append(f"Scraped {len(jobs)} jobs.")
        print(f"Extraction complete! Found {len(jobs)} jobs.")
    except Exception as e:
        print(f"Error during scrape request: {e}")
        state["run_log"].append(f"Scraping failed: {e}")
        state["raw_job_listings"] = []

    return state
