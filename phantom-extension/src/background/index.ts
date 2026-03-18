export { }

let socket: WebSocket | null = null;
let reconnectInterval = 5000;
let isConnecting = false;

// Store tab IDs to know how to process their messages
let activeScrapeTabId: number | null = null;
let activeReadTabId: number | null = null;

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
                const tab = await chrome.tabs.create({ url: data.url, active: false });
                activeScrapeTabId = tab.id ?? null;
            } else if (data.action === "read_job_page" && data.url) {
                console.log("Leaping to job page:", data.url);
                handleReadJobPage(data.url);
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
        reconnectInterval = Math.min(30000, reconnectInterval * 1.5);
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };
}

/**
 * Opens a job page tab and extracts the description using executeScript.
 *
 * WHY: The old approach (tab opens → content script auto-injects → sendMessage → background)
 * silently fails when the MV3 service worker goes dormant between tab creation and the
 * content script firing. executeScript returns a direct, synchronous result to the
 * background — no message passing needed, no silent drops.
 */
async function handleReadJobPage(url: string) {
    let tabId: number | null = null;
    try {
        const tab = await chrome.tabs.create({ url, active: true });
        tabId = tab.id ?? null;
        activeReadTabId = tabId;

        if (!tabId) {
            throw new Error("Tab creation returned no ID.");
        }

        // Wait for the tab to report status "complete"
        await new Promise<void>((resolve) => {
            chrome.tabs.onUpdated.addListener(function listener(updatedId, changeInfo) {
                if (updatedId === tabId && changeInfo.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            });
        });

        console.log("Tab loaded. Waiting 2s for JS framework to render content...");
        await new Promise(r => setTimeout(r, 2000));

        // Inject extraction function directly into the page.
        // The function runs in the page's context; its return value is sent back here.
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractJobDescriptionFromPage,
        });

        const details = results?.[0]?.result ?? { full_description: "", url };
        console.log(`Leap complete. Extracted ${details.full_description?.length ?? 0} chars.`);

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                status: "success",
                type: "job_details",
                data: details,
            }));
        }
    } catch (err) {
        console.error("handleReadJobPage failed:", err);
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                status: "error",
                type: "job_details",
                message: String(err),
            }));
        }
    } finally {
        activeReadTabId = null;
    }
}

/**
 * Runs INSIDE the job page tab via executeScript.
 * MUST be self-contained — no closures over background script variables allowed.
 * Tries multiple selectors to handle Indeed DOM variations.
 */
function extractJobDescriptionFromPage(): { full_description: string; url: string } {
    const selectors = [
        "#jobDescriptionText",
        ".jobsearch-JobComponent-description",
        ".jobsearch-jobDescriptionText",
        "[class*='jobDescriptionText']",
        "[id*='jobDescription']",
        "[data-testid='jobsearch-JobComponent-description']",
    ];

    let descEl: Element | null = null;
    for (const sel of selectors) {
        descEl = document.querySelector(sel);
        if (descEl) break;
    }

    return {
        full_description: descEl ? (descEl as HTMLElement).innerText.trim() : "",
        url: window.location.href,
    };
}

// Listen for messages from content scripts — only used for the scrape phase now.
// The leap (read_job_page) phase uses executeScript directly and does NOT use sendMessage.
chrome.runtime.onMessage.addListener((request, sender) => {
    if (request.action === "extracted_jobs") {
        console.log("Received jobs from content script:", request.jobs);

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                status: "success",
                type: "scrape_results",
                data: request.jobs,
            }));
        }

        if (sender.tab?.id && sender.tab.id === activeScrapeTabId) {
            chrome.tabs.remove(sender.tab.id);
            activeScrapeTabId = null;
        }
    }
    // "extracted_job_details" is intentionally NOT handled here any more — see handleReadJobPage.
});

// Start WebSocket connection to backend
connectWebSocket();
