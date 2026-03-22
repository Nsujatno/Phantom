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
 * Sweeps the DOM for inputs and buttons, generates IDs, and creates a JSON representation.
 */
function extractFormFields(): { pageTitle: string, fields: SerializedField[] } {
    console.log("Extracting form fields for Phantom...");
    const elements = document.querySelectorAll('input:not([type="hidden"]), select, textarea, button, a');
    
    const fields: SerializedField[] = [];
    let idCounter = 1;

    elements.forEach((el: Element) => {
        const tagName = el.tagName.toLowerCase();
        let type = el.getAttribute('type') || "";

        if (tagName === "input" && type.toLowerCase() === "hidden") {
            return;
        }

        if (tagName === "a") {
            const text = (el as HTMLElement).innerText?.toLowerCase() || "";
            const role = el.getAttribute("role");
            const className = el.className.toLowerCase();
            
            const isActionable = 
                role === "button" || 
                className.includes("btn") || 
                className.includes("button") ||
                text.includes("apply") || 
                text.includes("next") || 
                text.includes("submit") || 
                text.includes("continue");
                
            if (!isActionable) {
                return;
            }
            type = "link";
        }

        const phantomId = `phantom-field-${idCounter++}`;
        el.setAttribute('data-phantom-id', phantomId);

        let labelText = "";

        if (tagName === "button" || tagName === "a" || (tagName === "input" && ["submit", "button"].includes(type.toLowerCase()))) {
            labelText = (el as HTMLElement).innerText || el.getAttribute("value") || el.getAttribute("aria-label") || "";
        } else {
            // 1. Check for standard <label for="...">
            const id = el.getAttribute("id");
            if (id) {
                const labelEl = document.querySelector(`label[for="${id}"]`);
                if (labelEl) labelText = (labelEl as HTMLElement).innerText;
            }

            // 2. Check for wrapping <label>
            if (!labelText) {
                const wrapper = el.closest("label");
                if (wrapper) labelText = (wrapper as HTMLElement).innerText;
            }

            // 3. Fallback to aria-label
            if (!labelText) {
                labelText = el.getAttribute("aria-label") || "";
            }
            
            // Fallback to placeholder or name
            if (!labelText) {
                labelText = el.getAttribute("placeholder") || el.getAttribute("name") || "Unknown Field";
            }

            // Context Extraction for radio and checkboxes
            if (tagName === "input" && (type.toLowerCase() === "radio" || type.toLowerCase() === "checkbox")) {
                const container = el.closest('fieldset, div[role="group"], div[role="radiogroup"], .form-group, tr, li, .application-question');
                if (container) {
                    const legend = container.querySelector('legend');
                    let questionText = "";
                    if (legend) {
                        questionText = (legend as HTMLElement).innerText.trim();
                    } else {
                        // Fallback: use the first line of the container's innerText
                        questionText = (container as HTMLElement).innerText.trim().split('\n')[0];
                    }
                    
                    // Only append if it seems like a valid question and not just the label itself
                    if (questionText && questionText.length < 200 && questionText !== labelText) {
                        labelText = `Question: ${questionText} | Option: ${labelText}`;
                    }
                }
            }
        }

        const isRequired = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
        
        let componentType = tagName;
        if (tagName === "input") {
            componentType = type || "text";
        }

        const fieldData: SerializedField = {
            phantom_id: phantomId,
            type: componentType,
            label: labelText.trim(),
            required: isRequired
        };

        // Extract options for selects
        if (tagName === "select") {
            const options = Array.from(el.querySelectorAll('option')).map(opt => (opt as HTMLOptionElement).innerText.trim());
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
 * Fills the DOM based on a mapping of { phantom_id: string_value } and clicks next_action_id
 */
function fillFormFields(response: any) {
    if (response.answers) {
        console.log("Phantom is filling fields:", response.answers);
        for (const [phantomId, value] of Object.entries(response.answers)) {
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
                el.value = value as string;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
            }
            // Mark as filled so we don't process it again
            el.setAttribute('data-phantom-filled', 'true');
        }
    }

    if (response.next_action_id) {
        console.log("Phantom is clicking next action:", response.next_action_id);
        const el = document.querySelector(`[data-phantom-id="${response.next_action_id}"]`);
        if (el && el instanceof HTMLElement) {
            el.click();
            el.setAttribute('data-phantom-filled', 'true');
        } else {
            console.warn(`Could not find button to click: ${response.next_action_id}`);
        }
    }
}

// Function to automatically orchestrate the extraction and filling
async function autoProcessForm() {
    if (isProcessing) return;
    
    // Check if there are unfilled inputs or unclicked buttons
    const actionableElements = document.querySelectorAll('input:not([type="hidden"]):not([data-phantom-filled="true"]), select:not([data-phantom-filled="true"]), textarea:not([data-phantom-filled="true"]), button:not([data-phantom-filled="true"]), a:not([data-phantom-filled="true"])');
    if (actionableElements.length === 0) return;

    // Filter to valid elements (actionable links or other elements)
    const validElements = Array.from(actionableElements).filter(el => {
        const tagName = el.tagName.toLowerCase();
        if (tagName === "a") {
            const text = (el as HTMLElement).innerText?.toLowerCase() || "";
            const role = el.getAttribute("role");
            const className = el.className.toLowerCase();
            return role === "button" || className.includes("btn") || className.includes("button") || text.includes("apply") || text.includes("next") || text.includes("submit") || text.includes("continue");
        }
        return true;
    });

    if (validElements.length === 0) return;

    isProcessing = true;
    console.log(`Found ${validElements.length} unfilled/unclicked actionable elements. Triggering auto-fill...`);

    // Mark these as evaluated to prevent infinite loops if the LLM decides not to interact with them
    validElements.forEach(el => el.setAttribute('data-phantom-filled', 'true'));

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
            
            // If it's not a known ATS and doesn't explicitly look like a job page, skip it
            if (!isKnownATS && !hasJobKeywords) {
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

            if (response && (response.answers || response.next_action_id)) {
                fillFormFields(response);
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

// Run initially after a short delay to let the page settle
setTimeout(autoProcessForm, 2500);

let observerTimeout: ReturnType<typeof setTimeout> | null = null;

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
        if (observerTimeout) {
            clearTimeout(observerTimeout);
        }
        // True debounce: Wait for 2 seconds of DOM inactivity before processing
        observerTimeout = setTimeout(autoProcessForm, 2000);
    }
});

observer.observe(document.body, { childList: true, subtree: true });

// Listen for messages from popup (fallback manual trigger)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "EXTRACT_FIELDS") {
        const data = extractFormFields();
        sendResponse(data);
    } else if (message.action === "FILL_FIELDS") {
        fillFormFields(message.response || message);
        sendResponse({ success: true });
    } else if (message.action === "extract_and_fill") {
        autoProcessForm().then(() => sendResponse({ success: true })).catch(err => sendResponse({ error: String(err) }));
        return true;
    }
    return true; // Keep message channel open for async response
});
