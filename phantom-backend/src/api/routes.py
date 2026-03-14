from fastapi import APIRouter
from pydantic import BaseModel

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
