import type { PlasmoCSConfig } from "plasmo"
import { classifyCurrentPage } from "./page-classifier"

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

interface AutoProcessResult {
    success: boolean;
    status: "idle" | "no_fields" | "skipped" | "filled" | "navigating" | "error";
    page_title: string;
    field_count: number;
    next_action_id?: string;
    clicked?: boolean;
    message?: string;
}

function normalizeText(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
}

function isElementVisible(el: Element): boolean {
    const htmlEl = el as HTMLElement;
    const style = window.getComputedStyle(htmlEl);
    const rect = htmlEl.getBoundingClientRect();

    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
        return false;
    }

    if (htmlEl.hidden || htmlEl.getAttribute("aria-hidden") === "true") {
        return false;
    }

    return rect.width > 0 && rect.height > 0;
}

function isElementDisabled(el: Element): boolean {
    return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
}

function getTextFromAriaLabelledBy(el: Element): string {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (!labelledBy) return "";

    return normalizeText(
        labelledBy
            .split(/\s+/)
            .map(id => document.getElementById(id)?.textContent || "")
            .join(" ")
    );
}

function getElementText(el: Element | null): string {
    if (!el) return "";
    return normalizeText((el as HTMLElement).innerText || el.textContent || "");
}

function getControlLabel(el: Element): string {
    const id = el.getAttribute("id");
    if (id) {
        const labelEl = document.querySelector(`label[for="${id}"]`);
        const explicitLabel = getElementText(labelEl);
        if (explicitLabel) return explicitLabel;
    }

    const wrapperLabel = getElementText(el.closest("label"));
    if (wrapperLabel) return wrapperLabel;

    const ariaLabelledBy = getTextFromAriaLabelledBy(el);
    if (ariaLabelledBy) return ariaLabelledBy;

    const ariaLabel = normalizeText(el.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel;

    const placeholder = normalizeText(el.getAttribute("placeholder"));
    if (placeholder) return placeholder;

    const name = normalizeText(el.getAttribute("name"));
    if (name) return name;

    return "";
}

function getQuestionText(el: Element, optionLabel: string): string {
    const groupContainer = el.closest('fieldset, [role="radiogroup"], [role="group"], .form-group, tr, li, .application-question');
    if (!groupContainer) return "";

    const candidateTexts = [
        getElementText(groupContainer.querySelector("legend")),
        getTextFromAriaLabelledBy(groupContainer),
        ...Array.from(
            groupContainer.querySelectorAll("h1, h2, h3, h4, h5, h6, .question, .prompt, .label, label, p, span, div")
        ).map(node => getElementText(node))
    ];

    for (const text of candidateTexts) {
        if (!text) continue;
        if (text === optionLabel) continue;
        if (text.includes(optionLabel) && text.length <= optionLabel.length + 5) continue;
        if (text.length > 200) continue;
        return text;
    }

    return "";
}

function getGroupedOptions(el: Element, type: string): string[] {
    const name = el.getAttribute("name");
    const groupContainer = el.closest('fieldset, [role="radiogroup"], [role="group"], .form-group, tr, li, .application-question');

    let groupElements: Element[] = [];
    if (groupContainer) {
        groupElements = Array.from(groupContainer.querySelectorAll(`input[type="${type}"]`));
    } else if (name) {
        groupElements = Array.from(document.querySelectorAll(`input[type="${type}"][name="${name}"]`));
    }

    const options = groupElements
        .map(optionEl => {
            const optionText = getControlLabel(optionEl);
            return optionText || normalizeText(optionEl.getAttribute("value"));
        })
        .filter(Boolean);

    return Array.from(new Set(options));
}

function findLauncherActionElement(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll("a[href], button, [role='button']")).filter(
        (candidate) => isElementVisible(candidate) && !isElementDisabled(candidate)
    ) as HTMLElement[];

    const strongPatterns = [
        /apply on company site/i,
        /continue to application/i,
        /continue applying/i,
        /go to application/i,
        /apply now/i,
        /^apply$/i
    ];

    return candidates.find((candidate) => {
        const label = normalizeText(
            candidate.innerText ||
            candidate.getAttribute("aria-label") ||
            candidate.getAttribute("value") ||
            candidate.textContent
        );

        return strongPatterns.some((pattern) => pattern.test(label));
    }) || null;
}

function findClickableTarget(el: HTMLElement): HTMLElement {
    const candidateSelectors = [
        "a[href]",
        "button",
        "[role='button']",
        "[data-testid]",
        "[aria-label]"
    ];

    for (const selector of candidateSelectors) {
        const descendant = el.querySelector(selector);
        if (descendant instanceof HTMLElement && isElementVisible(descendant) && !isElementDisabled(descendant)) {
            return descendant;
        }
    }

    const ancestor = el.closest("a[href], button, [role='button']");
    if (ancestor instanceof HTMLElement && isElementVisible(ancestor) && !isElementDisabled(ancestor)) {
        return ancestor;
    }

    return el;
}

function findActionByLabel(label: string): HTMLElement | null {
    const normalizedLabel = normalizeText(label);
    if (!normalizedLabel) return null;

    const candidates = Array.from(document.querySelectorAll("a[href], button, [role='button'], input[type='button'], input[type='submit']"));
    for (const candidate of candidates) {
        if (!isElementVisible(candidate) || isElementDisabled(candidate)) continue;

        const candidateLabel = normalizeText(
            (candidate as HTMLElement).innerText ||
            candidate.getAttribute("aria-label") ||
            candidate.getAttribute("value") ||
            candidate.textContent
        );

        if (candidateLabel === normalizedLabel) {
            return candidate as HTMLElement;
        }
    }

    return null;
}

function triggerActionElement(el: HTMLElement): { clicked: boolean; method: string } {
    const target = findClickableTarget(el);
    target.scrollIntoView({ block: "center", inline: "center" });
    target.focus();

    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    target.click();

    if (target instanceof HTMLAnchorElement) {
        const href = target.href?.trim();
        if (href && href !== "#" && !href.toLowerCase().startsWith("javascript:")) {
            setTimeout(() => window.location.assign(href), 50);
            return { clicked: true, method: "anchor-navigate" };
        }
    }

    const nestedAnchor = target.querySelector?.("a[href]") || target.closest("a[href]");
    if (nestedAnchor instanceof HTMLAnchorElement) {
        const href = nestedAnchor.href?.trim();
        if (href && href !== "#" && !href.toLowerCase().startsWith("javascript:")) {
            setTimeout(() => window.location.assign(href), 50);
            return { clicked: true, method: "nested-anchor-navigate" };
        }
    }

    if (target instanceof HTMLButtonElement || target.getAttribute("role") === "button") {
        return { clicked: true, method: "button-click" };
    }

    return { clicked: true, method: "element-click" };
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

        if (!isElementVisible(el) || isElementDisabled(el)) {
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
        const normalizedType = type.toLowerCase();

        if (tagName === "button" || tagName === "a" || (tagName === "input" && ["submit", "button"].includes(normalizedType))) {
            labelText = normalizeText((el as HTMLElement).innerText || el.getAttribute("value") || el.getAttribute("aria-label"));
        } else {
            const controlLabel = getControlLabel(el);

            if (tagName === "input" && (normalizedType === "radio" || normalizedType === "checkbox")) {
                const optionLabel = controlLabel || normalizeText(el.getAttribute("value"));
                const questionText = getQuestionText(el, optionLabel);
                labelText = questionText && optionLabel && questionText !== optionLabel
                    ? `${questionText} (${optionLabel})`
                    : optionLabel || questionText;
            } else {
                labelText = controlLabel;
            }

            if (!labelText) {
                labelText = "Unknown Field";
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
            label: normalizeText(labelText) || "Unknown Field",
            required: isRequired
        };

        // Extract options for selects
        if (tagName === "select") {
            const options = Array.from(el.querySelectorAll('option')).map(opt => (opt as HTMLOptionElement).innerText.trim());
            fieldData.options = options.filter(o => o.length > 0);
        } else if (tagName === "input" && (normalizedType === "radio" || normalizedType === "checkbox")) {
            const options = getGroupedOptions(el, normalizedType);
            if (options.length > 0) {
                fieldData.options = options;
            }
        }
        
        const isDuplicate = fields.some(existing =>
            existing.type === fieldData.type &&
            existing.label === fieldData.label
        );

        if (!isDuplicate) {
            fields.push(fieldData);
        }
    });

    return {
        pageTitle: document.title || document.querySelector("h1")?.textContent || "Form Page",
        fields
    };
}

/**
 * Fills the DOM based on a mapping of { phantom_id: string_value } and clicks next_action_id
 */
function fillFormFields(response: any): { filledCount: number; clicked: boolean; nextActionId?: string; clickMethod?: string; clickError?: string } {
    let filledCount = 0;
    let clicked = false;
    let clickMethod: string | undefined;
    let clickError: string | undefined;

    if (response.answers) {
        console.log("Phantom is filling fields:", response.answers);
        for (const [phantomId, value] of Object.entries(response.answers)) {
            const el = document.querySelector(`[data-phantom-id="${phantomId}"]`);
            if (!el) {
                console.warn(`Could not find element for ${phantomId}`);
                continue;
            }

            if (el instanceof HTMLInputElement && el.type === 'radio') {
                const normalizedValue = String(value ?? "").trim().toLowerCase();
                const shouldCheck = !["", "false", "unchecked", "off", "0"].includes(normalizedValue);
                el.checked = shouldCheck;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
            } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
                const normalizedValue = String(value ?? "").trim().toLowerCase();
                const shouldCheck = ["true", "checked", "yes", "on", "1"].includes(normalizedValue);
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
            filledCount += 1;
        }
    }

    if (response.next_action_id) {
        console.log("Phantom is clicking next action:", response.next_action_id);
        const el = document.querySelector(`[data-phantom-id="${response.next_action_id}"]`);
        if (el && el instanceof HTMLElement) {
            const clickResult = triggerActionElement(el);
            el.setAttribute('data-phantom-filled', 'true');
            clicked = clickResult.clicked;
            clickMethod = clickResult.method;
        } else {
            console.warn(`Could not find button to click: ${response.next_action_id}`);
            clickError = `Could not find button to click: ${response.next_action_id}`;
        }

        if (!clicked) {
            const selectedField = response.next_action_id
                ? document.querySelector(`[data-phantom-id="${response.next_action_id}"]`)
                : null;
            const selectedLabel = selectedField ? getControlLabel(selectedField) || getElementText(selectedField) : "";
            const fallbackTarget = findActionByLabel(selectedLabel);

            if (fallbackTarget) {
                const fallbackResult = triggerActionElement(fallbackTarget);
                clicked = fallbackResult.clicked;
                clickMethod = `fallback:${fallbackResult.method}`;
                clickError = undefined;
            }
        }
    }

    return {
        filledCount,
        clicked,
        nextActionId: response.next_action_id || undefined,
        clickMethod,
        clickError
    };
}

// Function to automatically orchestrate the extraction and filling
async function autoProcessForm(): Promise<AutoProcessResult> {
    if (isProcessing) {
        return {
            success: false,
            status: "idle",
            page_title: document.title || "Form Page",
            field_count: 0,
            message: "Processing already in progress."
        };
    }
    
    // Check if there are unfilled inputs or unclicked buttons
    const actionableElements = document.querySelectorAll('input:not([type="hidden"]):not([data-phantom-filled="true"]), select:not([data-phantom-filled="true"]), textarea:not([data-phantom-filled="true"]), button:not([data-phantom-filled="true"]), a:not([data-phantom-filled="true"])');
    if (actionableElements.length === 0) {
        return {
            success: false,
            status: "idle",
            page_title: document.title || "Form Page",
            field_count: 0,
            message: "No actionable elements found."
        };
    }

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

    if (validElements.length === 0) {
        return {
            success: false,
            status: "idle",
            page_title: document.title || "Form Page",
            field_count: 0,
            message: "No valid actionable elements found."
        };
    }

    isProcessing = true;
    console.log(`Found ${validElements.length} unfilled/unclicked actionable elements. Triggering auto-fill...`);

    try {
        const classification = classifyCurrentPage();
        console.log("Page classification:", classification);

        if (classification.kind === "job_listing_launcher") {
            const launcherAction = findLauncherActionElement();
            if (launcherAction) {
                const clickResult = triggerActionElement(launcherAction);
                launcherAction.setAttribute("data-phantom-filled", "true");
                return {
                    success: clickResult.clicked,
                    status: clickResult.clicked ? "navigating" : "error",
                    page_title: document.title || "Form Page",
                    field_count: validElements.length,
                    clicked: clickResult.clicked,
                    message: `launcher:${clickResult.method}`
                };
            }

            return {
                success: false,
                status: "error",
                page_title: document.title || "Form Page",
                field_count: validElements.length,
                message: "Launcher page detected but no launcher action element was found."
            };
        }

        // Mark these as evaluated only after we decide to use the generic LLM flow.
        validElements.forEach(el => el.setAttribute('data-phantom-filled', 'true'));

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
            if (classification.kind === "unknown" && !isKnownATS && !hasJobKeywords) {
                console.log("Phantom Applier: Does not look like a job application page (missed heuristic). Skipping trigger.");
                return {
                    success: false,
                    status: "skipped",
                    page_title: data.pageTitle,
                    field_count: data.fields.length,
                    message: "Page did not match job application heuristics."
                };
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
                const fillResult = fillFormFields(response);
                return {
                    success: fillResult.clicked || fillResult.filledCount > 0,
                    status: fillResult.clicked ? "navigating" : "filled",
                    page_title: data.pageTitle,
                    field_count: data.fields.length,
                    next_action_id: fillResult.nextActionId,
                    clicked: fillResult.clicked,
                    message: fillResult.clickError || fillResult.clickMethod
                };
            } else if (response && response.error) {
                console.error("Phantom Auto-Fill Backend Error:", response.error);
                return {
                    success: false,
                    status: "error",
                    page_title: data.pageTitle,
                    field_count: data.fields.length,
                    message: String(response.error)
                };
            }
        }
        return {
            success: false,
            status: "no_fields",
            page_title: data.pageTitle,
            field_count: data.fields.length,
            message: "No fields were extracted from the page."
        };
    } catch (e) {
        console.error("Error in autoProcessForm:", e);
        return {
            success: false,
            status: "error",
            page_title: document.title || "Form Page",
            field_count: 0,
            message: String(e)
        };
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
        autoProcessForm().then(sendResponse).catch(err => sendResponse({ success: false, status: "error", error: String(err) }));
        return true;
    }
    return true; // Keep message channel open for async response
});
