import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
    matches: ["https://*.indeed.com/jobs*", "https://*.indeed.com/viewjob*", "https://*.indeed.com/rc/clk*"],
    run_at: "document_idle"
}

console.log("Extractor content script injected on Indeed.");

async function waitForJobDescription(timeoutMs: number = 60000): Promise<string> {
    return new Promise((resolve) => {
        const getDesc = () => {
            const descEl = document.querySelector("#jobDescriptionText") ||
                document.querySelector(".jobsearch-JobComponent-description") ||
                document.querySelector(".jobsearch-jobDescriptionText");
            return descEl ? (descEl as HTMLElement).innerText.trim() : "";
        };

        const existing = getDesc();
        if (existing) return resolve(existing);

        const observer = new MutationObserver(() => {
            const current = getDesc();
            if (current) {
                observer.disconnect();
                clearTimeout(timeoutId);
                resolve(current);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        const timeoutId = setTimeout(() => {
            observer.disconnect();
            resolve(getDesc());
        }, timeoutMs);
    });
}

async function extractFullJobDetails() {
    console.log("Extracting high-fidelity job details...");
    const description = await waitForJobDescription();

    chrome.runtime.sendMessage({
        action: "extracted_job_details",
        details: {
            full_description: description,
            url: window.location.href
        }
    });
}

async function waitForJobCards(timeoutMs: number = 120000): Promise<NodeListOf<Element>> {
    return new Promise((resolve) => {
        // Check if already present
        let cards = document.querySelectorAll(".job_seen_beacon");
        if (cards.length > 0) {
            return resolve(cards);
        }

        console.log(`Waiting for job cards via MutationObserver (up to ${timeoutMs / 1000}s)...`);

        const observer = new MutationObserver((mutations, obs) => {
            cards = document.querySelectorAll(".job_seen_beacon");
            if (cards.length > 0) {
                console.log("Job cards detected by MutationObserver.");
                obs.disconnect();
                clearTimeout(timeoutId);
                resolve(cards);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Timeout fallback
        const timeoutId = setTimeout(() => {
            console.warn(`No job cards found after ${timeoutMs / 1000} seconds. Indeed DOM may have changed or blocked us.`);
            observer.disconnect();
            resolve(document.querySelectorAll(".job_seen_beacon")); // Return empty list
        }, timeoutMs);
    });
}

async function extractJobs() {
    console.log("Looking for job cards...");

    const jobCards = await waitForJobCards(120000); // 2 minutes timeout for CAPTCHAs/slow loads

    if (jobCards.length === 0) {
        // We don't close the tab immediately on failure so the user can inspect it, we just send empty to unblock backend
        chrome.runtime.sendMessage({ action: "extracted_jobs", jobs: [] });
        return;
    }

    const jobs = [];

    // Don't delete this line, for ease of testing
    Array.from(jobCards).slice(0, 1).forEach(card => {
        // jobCards.forEach(card => {
        try {
            const titleEl = card.querySelector(".jcs-JobTitle span") || card.querySelector(".jcs-JobTitle");
            const title = titleEl ? (titleEl as HTMLElement).innerText.trim() : "Unknown Title";

            const companyEl = card.querySelector('[data-testid="company-name"]');
            const company = companyEl ? (companyEl as HTMLElement).innerText.trim() : "Unknown Company";

            const linkEl = card.querySelector(".jcs-JobTitle") as HTMLAnchorElement;
            const jk = linkEl?.getAttribute("data-jk") || card.getAttribute("data-jk");

            let finalUrl = "";
            if (jk) {
                finalUrl = `https://www.indeed.com/viewjob?jk=${jk}`;
            } else if (linkEl && linkEl.href) {
                finalUrl = new URL(linkEl.href, window.location.origin).href.split("?")[0];
            }

            // Simple description extraction from the card snippet
            const snippetEl = card.querySelector(".css-9446fg") || card.querySelector(".job-snippet");
            const description_snippet = snippetEl ? (snippetEl as HTMLElement).innerText.trim().replace(/\n/g, ' ') : "";

            if (title !== "Unknown Title" && finalUrl) {
                jobs.push({
                    title,
                    company,
                    url: finalUrl,
                    description_snippet
                });
            }
        } catch (err) {
            console.error("Error parsing a job card:", err);
        }
    });

    console.log(`Extracted ${jobs.length} jobs.`);

    // Send back to the service worker
    chrome.runtime.sendMessage({
        action: "extracted_jobs",
        jobs: jobs
    });
}

// Main execution entry point
const url = window.location.href;
if (url.includes("/viewjob") || url.includes("/rc/clk")) {
    extractFullJobDetails();
} else if (url.includes("/jobs")) {
    extractJobs();
}
