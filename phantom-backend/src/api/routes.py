from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import json
from src.api.socket_manager import manager
from src.models.schemas import ApplyStepRequest, ApplyStepResponse
from src.services.applier import generate_answers_for_step

router = APIRouter()

class StatusResponse(BaseModel):
    status: str

@router.post("/status", response_model=StatusResponse)
async def get_status():
    return {"status": "running"}

@router.post("/stop", response_model=StatusResponse)
async def stop_pipeline():
    return {"status": "stopped"}

@router.post("/answers")
async def get_answers(data: dict):
    return {"answers": {}}

@router.post("/apply-step", response_model=ApplyStepResponse)
async def process_apply_step(request: ApplyStepRequest):
    """
    Receives extracted form fields from the extension and returns LLM-drafted answers.
    """
    try:
        response = generate_answers_for_step(request)
        return response
    except Exception as e:
        print(f"Error in apply-step: {e}")
        return ApplyStepResponse(answers={})

@router.websocket("/ws/scraper")
async def websocket_scraper(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            if payload.get("status") == "success" and "data" in payload:
                if payload.get("type") == "job_details":
                    manager.resolve_job_details(payload["data"])
                elif payload.get("type") == "apply_result":
                    manager.resolve_apply(payload["data"])
                else:
                    manager.resolve_scrape(payload["data"])
            elif payload.get("status") == "error":
                print(f"Extension reported an error: {payload.get('message')}")
                if payload.get("type") == "job_details":
                    manager.resolve_job_details({})
                elif payload.get("type") == "apply_result":
                    manager.resolve_apply({"status": "error", "message": str(payload.get('message'))})
                else:
                    manager.resolve_scrape([]) # Resolve with empty to avoid hanging
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket Error: {e}")
        manager.disconnect(websocket)

