import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
    matches: [
        "https://*.indeed.com/jobs*", 
        "https://*.indeed.com/viewjob*", 
        "https://*.indeed.com/rc/clk*",
        "https://apply.indeed.com/*",
        // Top Applicant Tracking Systems (ATS)
        "https://*.greenhouse.io/*",
        "https://boards.greenhouse.io/*",
        "https://jobs.lever.co/*",
        "https://boards.eu.greenhouse.io/*",
        "https://*.workday.com/*",
        "https://*.myworkdayjobs.com/*",
        "https://*.workable.com/*",
        "https://*.smartrecruiters.com/*",
        "https://*.breezy.hr/*",
        "https://*.applytojob.com/*",
        "https://*.icims.com/*",
        "https://jobs.ashbyhq.com/*",
        "https://*.rippling-ats.com/*",
        "https://jobs.jobvite.com/*",
        // Catch-all heuristic wildcard for other domains (Requires heuristic check inside code)
        "<all_urls>"
    ],
    all_frames: true, // Crucial because forms are often embedded in iframes
    run_at: "document_idle"
}

console.log("Phantom Applier script injected.");

let isProcessing = false;

interface SerializedField {
    phantom_id: string;
    type: string;
    label: string;
    required: boolean;
    options?: string[];
}

/**
 * Sweeps the DOM for inputs, generates IDs, and creates a JSON representation.
 */
function extractFormFields(): { pageTitle: string, fields: SerializedField[] } {
    console.log("Extracting form fields for Phantom...");
    const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
    
    const fields: SerializedField[] = [];
    let idCounter = 1;

    inputs.forEach((inputEl: Element) => {
        // Skip hidden inputs, buttons, submits etc
        const type = inputEl.getAttribute('type');
        if (type && ["submit", "button", "hidden", "image"].includes(type.toLowerCase())) {
            return;
        }

        const phantomId = `phantom-field-${idCounter++}`;
        inputEl.setAttribute('data-phantom-id', phantomId);

        let labelText = "";

        // 1. Check for standard <label for="...">
        const id = inputEl.getAttribute("id");
        if (id) {
            const labelEl = document.querySelector(`label[for="${id}"]`);
            if (labelEl) labelText = (labelEl as HTMLElement).innerText;
        }

        // 2. Check for wrapping <label>
        if (!labelText) {
            const wrapper = inputEl.closest("label");
            if (wrapper) labelText = wrapper.innerText;
        }

        // 3. Fallback to aria-label
        if (!labelText) {
            labelText = inputEl.getAttribute("aria-label") || "";
        }
        
        // Fallback to placeholder or name
        if (!labelText) {
            labelText = inputEl.getAttribute("placeholder") || inputEl.getAttribute("name") || "Unknown Field";
        }

        const isRequired = inputEl.hasAttribute('required') || inputEl.getAttribute('aria-required') === 'true';
        
        const fieldData: SerializedField = {
            phantom_id: phantomId,
            type: inputEl.tagName.toLowerCase() === "input" ? (type || "text") : inputEl.tagName.toLowerCase(),
            label: labelText.trim(),
            required: isRequired
        };

        // Extract options for selects
        if (inputEl.tagName.toLowerCase() === "select") {
            const options = Array.from(inputEl.querySelectorAll('option')).map(opt => (opt as HTMLOptionElement).innerText.trim());
            fieldData.options = options.filter(o => o.length > 0);
        }
        
        fields.push(fieldData);
    });

    return {
        pageTitle: document.title || document.querySelector("h1")?.textContent || "Form Page",
        fields
    };
}

/**
 * Fills the DOM based on a mapping of { phantom_id: string_value }
 */
function fillFormFields(answers: Record<string, string>) {
    console.log("Phantom is filling fields:", answers);
    for (const [phantomId, value] of Object.entries(answers)) {
        const el = document.querySelector(`[data-phantom-id="${phantomId}"]`);
        if (!el) {
            console.warn(`Could not find element for ${phantomId}`);
            continue;
        }

        if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
            const shouldCheck = value === 'true' || value === 'checked' || value === 'Yes';
            el.checked = shouldCheck;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        // Mark as filled so we don't process it again
        el.setAttribute('data-phantom-filled', 'true');
    }
}

// Function to automatically orchestrate the extraction and filling
async function autoProcessForm() {
    if (isProcessing) return;
    
    // Check if there are unfilled inputs
    const unfilledInputs = document.querySelectorAll('input:not([type="hidden"]):not([data-phantom-filled="true"]), select:not([data-phantom-filled="true"]), textarea:not([data-phantom-filled="true"])');
    // Only process if we have a reasonable number of inputs to fill (e.g. > 0)
    // Sometimes Indeed has a search bar at top, we want to be careful. But let's assume if we are on apply page, we fill.
    // To be safe, let's only do it if the page URL contains apply or if there are specific apply related elements, 
    // or just if there's > 0 unfilled inputs.
    if (unfilledInputs.length === 0) return;

    // Filter out buttons/submits
    const validInputs = Array.from(unfilledInputs).filter(el => {
        const type = el.getAttribute('type');
        return !(type && ["submit", "button", "hidden", "image"].includes(type.toLowerCase()));
    });

    if (validInputs.length === 0) return;

    isProcessing = true;
    console.log(`Found ${validInputs.length} unfilled inputs. Triggering auto-fill...`);

    try {
        const data = extractFormFields();
        if (data.fields.length > 0) {
            
            // --- Heuristic Check for general URLs ---
            const titleLow = data.pageTitle.toLowerCase();
            const urlLow = window.location.href.toLowerCase();
            const hasJobKeywords = titleLow.includes("apply") || titleLow.includes("career") || titleLow.includes("job") 
                                || urlLow.includes("apply") || urlLow.includes("career") || urlLow.includes("job");
            
            const isKnownATS = [
                "greenhouse.io", "lever.co", "workday.com", "myworkdayjobs.com", 
                "workable.com", "smartrecruiters.com", "breezy.hr", "applytojob.com", 
                "icims.com", "ashbyhq.com", "rippling-ats.com", "jobvite.com", 
                "indeed.com"
            ].some(domain => urlLow.includes(domain));
            
            // If it's not a known ATS and doesn't explicitly look like a job page with enough fields, skip it
            if (!isKnownATS && (!hasJobKeywords || validInputs.length < 3)) {
                console.log("Phantom Applier: Does not look like a job application page (missed heuristic). Skipping trigger.");
                return;
            }
            // ----------------------------------------

            // Send to background to avoid CSP
            const response = await chrome.runtime.sendMessage({
                action: "DO_BACKEND_APPLY",
                payload: {
                    page_url: window.location.href,
                    page_title: data.pageTitle,
                    fields: data.fields
                }
            });

            if (response && response.answers) {
                fillFormFields(response.answers);
            } else if (response && response.error) {
                console.error("Phantom Auto-Fill Backend Error:", response.error);
            }
        }
    } catch (e) {
        console.error("Error in autoProcessForm:", e);
    } finally {
        setTimeout(() => { isProcessing = false; }, 2000); // Debounce
    }
}

// Run initially
setTimeout(autoProcessForm, 2000);

// Set up MutationObserver to detect new form steps in SPAs
const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            shouldCheck = true;
            break;
        }
    }
    if (shouldCheck) {
        // Debounce the check
        setTimeout(autoProcessForm, 1000);
    }
});

observer.observe(document.body, { childList: true, subtree: true });

// Listen for messages from popup (fallback manual trigger)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "EXTRACT_FIELDS") {
        const data = extractFormFields();
        sendResponse(data);
    } else if (message.action === "FILL_FIELDS") {
        fillFormFields(message.answers);
        sendResponse({ success: true });
    } else if (message.action === "extract_and_fill") {
        autoProcessForm().then(() => sendResponse({ success: true })).catch(err => sendResponse({ error: String(err) }));
        return true;
    }
    return true; // Keep message channel open for async response
});
