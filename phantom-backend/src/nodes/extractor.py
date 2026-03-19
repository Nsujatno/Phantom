from src.state.graph_state import PipelineState
from src.api.socket_manager import manager
from src.services.notion_service import NotionService
import asyncio

async def extract_job_details(state: PipelineState) -> PipelineState:
    """Navigates to the job URLs and extracts high-fidelity job descriptions."""
    state["run_log"].append("Extracting job details started.")
    print("\n--- Extracting Job Details (The Leap) ---")
    
    raw_jobs = state.get("raw_job_listings", [])
    if not raw_jobs:
        print("No raw jobs to extract.")
        return state
        
    enriched_jobs_list = state.get("enriched_job_listings", [])
    notion = NotionService()

    for job_dict in raw_jobs:
        url = job_dict.get("url")
        if not url:
            print(f"Skipping job without URL: {job_dict.get('title')}")
            continue
            
        # Check if job already exists in Notion
        existing_id = notion.find_page_by_url(url)
        if existing_id:
            print(f"Skipping already processed job: {job_dict.get('title')} @ {job_dict.get('company')}")
            state["run_log"].append(f"Skipped duplicate job: {job_dict.get('title')}")
            continue
            
        print(f"Leaping to: {job_dict.get('title')} @ {job_dict.get('company')}...")
        
        try:
            # Send command to extension to open URL and scrape DOM
            details = await manager.request_job_details(url)
            
            if details and details.get("full_description"):
                job_dict["full_description"] = details.get("full_description")
                enriched_jobs_list.append(job_dict)
                print(f"  -> Extracted full description for {job_dict.get('title')} ({len(job_dict['full_description'])} chars)")
            else:
                print(f"  -> Failed to extract full description for {job_dict.get('title')}")
                
        except Exception as e:
            print(f"  -> Error leaping to {job_dict.get('title')}: {e}")
            state["run_log"].append(f"Error extracting {job_dict.get('title')}: {e}")

    state["enriched_job_listings"] = enriched_jobs_list
    state["run_log"].append(f"Extraction complete. {len(enriched_jobs_list)} jobs enriched.")
    print(f"--- Extraction Complete. {len(enriched_jobs_list)} enriched. ---")
    
    # Clear raw_job_listings as they are processed
    state["raw_job_listings"] = []

    return state
