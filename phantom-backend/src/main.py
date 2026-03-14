import uvicorn
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from src.api.routes import router

app = FastAPI(title="Phantom Local Agent")

# Register routes
app.include_router(router)

# Scheduler for the daily cron job
scheduler = AsyncIOScheduler()

@scheduler.scheduled_job('cron', hour=9, minute=0)
async def daily_pipeline_run():
    print("Running daily Phantom agent pipeline...")
    # Trigger graph pipeline here

@app.on_event("startup")
async def startup_event():
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()

if __name__ == "__main__":
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
