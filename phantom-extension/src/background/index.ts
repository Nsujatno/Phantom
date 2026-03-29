export { }

let socket: WebSocket | null = null;
let reconnectInterval = 5000;
let isConnecting = false;

// Store tab IDs to know how to process their messages
let activeScrapeTabId: number | null = null;
let activeReadTabId: number | null = null;
let activeApplyTabId: number | null = null;

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
            } else if (data.action === "start_apply" && data.url) {
                console.log("Starting auto-apply for:", data.url);
                handleAutoApply(data.url);
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
        // Close the read tab — extraction is complete and the tab is no longer needed.
        if (tabId !== null) {
            chrome.tabs.remove(tabId).catch(() => {});
        }
        activeReadTabId = null;
    }
}

async function handleAutoApply(url: string) {
    let tabId: number | null = null;
    try {
        const tab = await chrome.tabs.create({ url, active: true });
        tabId = tab.id ?? null;
        activeApplyTabId = tabId;

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

        console.log("Tab loaded. Waiting 7s for DOM and content script injection...");
        await new Promise(r => setTimeout(r, 7000));

        const result = await chrome.tabs.sendMessage(tabId, { action: "extract_and_fill" }).catch(e => ({ success: false, status: "error", message: String(e) }));
        console.log("Apply result from content script (first pass):", result);

        if (result && !result.success && result.status !== "navigating" && result.status !== "filled") {
            // Immediate failure on first load, close tab. The onRemoved listener will send the websocket response.
            chrome.tabs.remove(tabId).catch(() => {});
        }
        // DO NOT send socket result here. Wait for CLOSE_APPLY_TAB or tab closure.
        
    } catch (err) {
        console.error("handleAutoApply failed:", err);
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                status: "error",
                type: "apply_result",
                message: String(err),
            }));
        }
        if (activeApplyTabId !== null) {
            chrome.tabs.remove(activeApplyTabId).catch(() => {});
            activeApplyTabId = null;
        }
    }
}

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeApplyTabId) {
        console.log("Apply tab was closed. Resolving active apply session.");
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                status: "success",
                type: "apply_result",
                data: { success: false, status: "aborted", message: "Tab was closed before application finished." }
            }));
        }
        activeApplyTabId = null;
    }
});

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


// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    } else if (request.action === "DO_BACKEND_APPLY") {
        console.log("Routing DO_BACKEND_APPLY to backend:", request.payload);
        fetch("http://localhost:8000/apply-step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.payload)
        })
        .then(res => {
            if (!res.ok) throw new Error(`Backend err: ${res.statusText}`);
            return res.json();
        })
        .then(data => sendResponse(data))
        .catch(err => sendResponse({ error: String(err) }));
        
        return true; // Keep message channel open for async response
    } else if (request.action === "CLOSE_APPLY_TAB") {
        // Content script signals that the apply session is over (success or login wall).
        if (activeApplyTabId !== null) {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    status: "success",
                    type: "apply_result",
                    data: request.payload || { success: false, status: "aborted", message: "Tab closed programmatically" }
                }));
            }
            // Temporarily nullify the id so the onRemoved listener doesn't fire a duplicate "aborted" message
            const tabToClose = activeApplyTabId;
            activeApplyTabId = null;
            chrome.tabs.remove(tabToClose).catch(() => {});
        }
    } else if (request.action === "GET_CREDENTIALS") {
        chrome.storage.local.get("credentials", (data) => {
            const domain = request.domain;
            const creds = data.credentials?.[domain] ?? null;
            sendResponse({ creds });
        });
        return true;
    } else if (request.action === "FETCH_RESUME_FILE") {
        fetch("http://localhost:8000/resume-file")
            .then(r => r.arrayBuffer())
            .then(buf => {
                const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                sendResponse({ base64 });
            })
            .catch(err => sendResponse({ error: String(err) }));
        return true;
    }
    // "extracted_job_details" is intentionally NOT handled here any more — see handleReadJobPage.
});

// Start WebSocket connection to backend
connectWebSocket();
