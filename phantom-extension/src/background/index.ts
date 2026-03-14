export { }

let socket: WebSocket | null = null;
let reconnectInterval = 5000;
let isConnecting = false;

// Store the tab ID of the tab we scrape so we can close it
let activeScrapeTabId: number | null = null;

function connectWebSocket() {
    if (isConnecting || (socket && socket.readyState === WebSocket.OPEN)) return;

    isConnecting = true;
    console.log("Connecting to Phantom backend WebSocket...");

    socket = new WebSocket("ws://localhost:8000/ws/scraper");

    socket.onopen = () => {
        console.log("Connected to Phantom backend!");
        isConnecting = false;
        reconnectInterval = 5000; // reset
    };

    socket.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("Received WS message:", data);

            if (data.action === "start_scrape" && data.url) {
                console.log("Starting scrape for:", data.url);
                // Open the tab to start the scrape
                const tab = await chrome.tabs.create({ url: data.url, active: false });
                activeScrapeTabId = tab.id ?? null;
            }
        } catch (e) {
            console.error("Failed to parse WS message:", e);
        }
    };

    socket.onclose = () => {
        console.log("WebSocket disconnected. Reconnecting in", reconnectInterval / 1000, "seconds...");
        isConnecting = false;
        socket = null;
        setTimeout(connectWebSocket, reconnectInterval);
        // basic exponential backoff
        reconnectInterval = Math.min(30000, reconnectInterval * 1.5);
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        // onclose will handle the reconnect
    };
}

// Listen for messages from our content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extracted_jobs") {
        console.log("Received jobs from content script:", request.jobs);

        // Send back to the backend
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                status: "success",
                data: request.jobs
            }));
        } else {
            console.error("Cannot send jobs to backend, WebSocket is not open.");
        }

        // Close the tab if we spawned it for this specific scrape
        if (sender.tab?.id && sender.tab.id === activeScrapeTabId) {
            chrome.tabs.remove(sender.tab.id);
            activeScrapeTabId = null;
        }
    }
});

// Start connection ping
connectWebSocket();
