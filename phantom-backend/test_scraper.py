import asyncio
from src.nodes.scraper import async_scrape_jobs
from src.nodes.scorer import score_jobs
from src.state.graph_state import PipelineState
import uvicorn
import threading

def run_server():
    from src.main import app
    uvicorn.run(app, host="0.0.0.0", port=8000)

async def test_run():
    # Setup dummy state
    initial_state: PipelineState = {
        "raw_job_listings": [],
        "scored_jobs": [],
        "current_job": None,
        "form_fields": [],
        "drafted_answers": [],
        "validation_result": None,
        "run_log": [],
        "pipeline_status": "running"
    }

    # Give the extension 5 seconds to connect to the server
    print("Waiting 5 seconds for Chrome extension to connect via WebSocket...")
    await asyncio.sleep(5)

    print("\n--- Starting Scraper Test ---")
    scraped_state = await async_scrape_jobs(initial_state)
    print("\n--- Scraped Output ---")
    
    if scraped_state.get("raw_job_listings"):
        for job in scraped_state["raw_job_listings"]:
            print(f"- {job.get('title')} @ {job.get('company')}")
            print(f"  URL: {job.get('url')[:60]}...")
            
        print("\n--- Starting Scorer Test ---")
        final_state = score_jobs(scraped_state)
        
        print("\n--- Final Scored Output ---")
        for scored_job in final_state.get("scored_jobs", []):
            print(f"- [PASSED] {scored_job.job.title} @ {scored_job.job.company} | Score: {scored_job.score.overall_score}")
            print(f"  Reasoning: {scored_job.score.reasoning}")
    else:
        print("No jobs found or extraction failed.")

if __name__ == "__main__":
    # Start the server in a daemon thread so the extension can connect
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Run the test
    asyncio.run(test_run())