import asyncio
import uvicorn
from src.graph import app as langgraph_app
from src.state.graph_state import PipelineState

async def test_full_pipeline():
    """Runs the Phantom pipeline. Called from within uvicorn's event loop."""
    initial_state: PipelineState = {
        "raw_job_listings": [],
        "enriched_job_listings": [],
        "scored_jobs": [],
        "current_job": None,
        "form_fields": [],
        "drafted_answers": [],
        "validation_result": None,
        "run_log": [],
        "pipeline_status": "running"
    }

    print("\nWaiting 10 seconds for Chrome extension to connect...")
    print("MAKE SURE: Your Chrome extension is connected to ws://localhost:8000/ws/scraper")
    await asyncio.sleep(10)

    print("\n--- Invoking Phantom Pipeline (Look & Leap) ---")
    try:
        final_state = await langgraph_app.ainvoke(initial_state)

        print("\n--- Pipeline Run Log ---")
        for log in final_state.get("run_log", []):
            print(f" LOG: {log}")

        print("\n--- Final Results ---")
        scored = final_state.get("scored_jobs", [])
        print(f"Jobs reaching Apply threshold (>= 80): {len(scored)}")

        for sj in scored:
            print(f"- {sj.job.title} @ {sj.job.company} | SCORE: {sj.score.overall_score}/100")
            print(f"  Reasoning: {sj.score.reasoning}")

    except Exception as e:
        print(f"Pipeline execution failed: {e}")


if __name__ == "__main__":
    # Import FastAPI app and register the pipeline as a startup task
    # so it runs inside uvicorn's own event loop — sharing the same loop
    # as the WebSocket handler. This is critical: Futures created by
    # manager.request_scrape/request_job_details must be resolved on the
    # same loop that the WebSocket route runs on.
    from src.main import app as fastapi_app

    @fastapi_app.on_event("startup")
    async def run_pipeline_on_startup():
        asyncio.create_task(test_full_pipeline())

    uvicorn.run(fastapi_app, host="0.0.0.0", port=8000)

