from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import json
from src.api.socket_manager import manager

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

@router.websocket("/ws/scraper")
async def websocket_scraper(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            if payload.get("status") == "success" and "data" in payload:
                manager.resolve_scrape(payload["data"])
            elif payload.get("status") == "error":
                print(f"Extension reported an error: {payload.get('message')}")
                manager.resolve_scrape([]) # Resolve with empty to avoid hanging
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket Error: {e}")
        manager.disconnect(websocket)

