import asyncio
import json
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect

class ConnectionManager:
    def __init__(self):
        self.active_connection: Optional[WebSocket] = None
        self.scraper_future: Optional[asyncio.Future] = None
        self.job_details_future: Optional[asyncio.Future] = None
        self.apply_future: Optional[asyncio.Future] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        if self.active_connection:
            # Optionally close old connection if a new one comes in
            try:
                await self.active_connection.close()
            except Exception:
                pass
        self.active_connection = websocket
        print("Extension connected to WebSocket.")

    def disconnect(self, websocket: WebSocket):
        if self.active_connection == websocket:
            self.active_connection = None
            print("Extension disconnected from WebSocket.")

    async def send_message(self, message: dict):
        if self.active_connection:
            await self.active_connection.send_text(json.dumps(message))
        else:
            print("No active WebSocket connection to send message.")

    async def request_scrape(self, url: str) -> list[dict]:
        """Called by the LangGraph node to initiate a scrape and wait for results."""
        if not self.active_connection:
            raise RuntimeError("Cannot request scrape: Extension is not connected.")

        # Create a new future to wait for the result
        loop = asyncio.get_running_loop()
        self.scraper_future = loop.create_future()

        # Send the request to the extension
        await self.send_message({"action": "start_scrape", "url": url})

        # Wait for the extension to send the data back (90s timeout)
        try:
            return await asyncio.wait_for(self.scraper_future, timeout=90.0)
        except asyncio.TimeoutError:
            print("Scrape request timed out after 90s.")
            return []

    def resolve_scrape(self, data: list[dict]):
        """Called when the extension sends the scraped data back."""
        if self.scraper_future and not self.scraper_future.done():
            loop = self.scraper_future.get_loop()
            loop.call_soon_threadsafe(self.scraper_future.set_result, data)

    async def request_job_details(self, url: str) -> dict:
        """Called by the LangGraph node to navigate and read full job description."""
        if not self.active_connection:
            raise RuntimeError("Cannot request job details: Extension is not connected.")

        # Create a new future to wait for the result
        loop = asyncio.get_running_loop()
        self.job_details_future = loop.create_future()

        # Send the request to the extension
        await self.send_message({"action": "read_job_page", "url": url})

        # Wait for the extension to send the data back (90s timeout)
        try:
            return await asyncio.wait_for(self.job_details_future, timeout=90.0)
        except asyncio.TimeoutError:
            print(f"Job details request timed out for {url}")
            return {}

    def resolve_job_details(self, data: dict):
        """Called when the extension sends the job details back."""
        if self.job_details_future and not self.job_details_future.done():
            loop = self.job_details_future.get_loop()
            loop.call_soon_threadsafe(self.job_details_future.set_result, data)

    async def request_autonomous_apply(self, url: str) -> dict:
        """Called by the LangGraph node to navigate and start the application loop."""
        if not self.active_connection:
            raise RuntimeError("Cannot request apply: Extension is not connected.")

        # Create a new future to wait for the result
        loop = asyncio.get_running_loop()
        self.apply_future = loop.create_future()

        # Send the request to the extension
        await self.send_message({"action": "start_apply", "url": url})

        # Wait for the extension to finish (no timeout since applying takes time)
        try:
            return await asyncio.wait_for(self.apply_future, timeout=600.0)
        except asyncio.TimeoutError:
            print(f"Apply request timed out for {url}")
            return {"status": "error", "message": "timed out after 10 minutes"}

    def resolve_apply(self, data: dict):
        """Called when the extension sends the apply result back."""
        if self.apply_future and not self.apply_future.done():
            loop = self.apply_future.get_loop()
            loop.call_soon_threadsafe(self.apply_future.set_result, data)

manager = ConnectionManager()
