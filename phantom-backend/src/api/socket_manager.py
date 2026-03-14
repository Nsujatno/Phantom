import asyncio
import json
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect

class ConnectionManager:
    def __init__(self):
        self.active_connection: Optional[WebSocket] = None
        self.scraper_future: Optional[asyncio.Future] = None

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

        # Wait for the extension to send the data back
        return await self.scraper_future

    def resolve_scrape(self, data: list[dict]):
        """Called when the extension sends the scraped data back."""
        if self.scraper_future and not self.scraper_future.done():
            loop = self.scraper_future.get_loop()
            loop.call_soon_threadsafe(self.scraper_future.set_result, data)

manager = ConnectionManager()
