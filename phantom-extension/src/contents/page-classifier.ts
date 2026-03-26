export type PageKind =
    | "job_listing_launcher"
    | "application_form"
    | "application_review"
    | "success"
    | "unknown";

export interface PageClassification {
    kind: PageKind;
    confidence: "high" | "medium" | "low";
    reasoning: string;
    launcherLabel?: string;
}

function normalizeText(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
}

function isVisible(el: Element): boolean {
    const htmlEl = el as HTMLElement;
    const style = window.getComputedStyle(htmlEl);
    const rect = htmlEl.getBoundingClientRect();

    if (style.display === "none" || style.visibility === "hidden") {
        return false;
    }

    if (htmlEl.hidden || el.getAttribute("aria-hidden") === "true") {
        return false;
    }

    return rect.width > 0 && rect.height > 0;
}

function getElementLabel(el: Element): string {
    const htmlEl = el as HTMLElement;
    const fromText = normalizeText(htmlEl.innerText || htmlEl.textContent);
    const fromAria = normalizeText(el.getAttribute("aria-label"));
    const fromValue = normalizeText(el.getAttribute("value"));
    const fromPlaceholder = normalizeText(el.getAttribute("placeholder"));
    return fromText || fromAria || fromValue || fromPlaceholder;
}

function getVisibleFormControls(): Element[] {
    return Array.from(
        document.querySelectorAll("input:not([type='hidden']), select, textarea, button, a[href], [role='button']")
    ).filter(isVisible);
}

function getMeaningfulInputs(): Element[] {
    return Array.from(document.querySelectorAll("input:not([type='hidden']), select, textarea"))
        .filter(isVisible)
        .filter((el) => {
            const input = el as HTMLInputElement;
            const tag = el.tagName.toLowerCase();
            const type = (input.getAttribute("type") || "").toLowerCase();
            const label = getElementLabel(el).toLowerCase();

            if (tag === "textarea" || tag === "select") return true;
            if (["radio", "checkbox", "file", "email", "tel", "number", "date"].includes(type)) return true;
            if (["submit", "button", "image", "reset"].includes(type)) return false;
            if (label === "what" || label === "where") return false;
            if (input.name?.toLowerCase() === "q" || input.name?.toLowerCase() === "l") return false;
            return true;
        });
}

function findLauncherAction(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll("a[href], button, [role='button']"))
        .filter(isVisible) as HTMLElement[];

    const strongPatterns = [
        /apply on company site/i,
        /continue to application/i,
        /continue applying/i,
        /go to application/i,
        /apply now/i,
        /^apply$/i
    ];

    return candidates.find((candidate) => {
        const label = getElementLabel(candidate);
        return strongPatterns.some((pattern) => pattern.test(label));
    }) || null;
}

export function classifyCurrentPage(): PageClassification {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const bodyText = normalizeText(document.body.innerText).toLowerCase();
    const jobDescription = document.querySelector("#jobDescriptionText, .jobsearch-JobComponent-description, .jobsearch-jobDescriptionText");
    const meaningfulInputs = getMeaningfulInputs();
    const visibleControls = getVisibleFormControls();
    const launcherAction = findLauncherAction();
    const requiredInputs = meaningfulInputs.filter(
        (el) => el.hasAttribute("required") || el.getAttribute("aria-required") === "true"
    );

    const hasSuccessText =
        bodyText.includes("application submitted") ||
        bodyText.includes("thank you for applying") ||
        bodyText.includes("your application has been submitted");

    if (hasSuccessText) {
        return {
            kind: "success",
            confidence: "high",
            reasoning: "Confirmation text detected."
        };
    }

    const looksLikeBoardJobPage =
        url.includes("indeed.com/viewjob") ||
        url.includes("indeed.com/rc/clk") ||
        !!jobDescription;

    if (looksLikeBoardJobPage && launcherAction && meaningfulInputs.length <= 2 && requiredInputs.length === 0) {
        return {
            kind: "job_listing_launcher",
            confidence: "high",
            reasoning: "Job listing page detected with launcher CTA and no meaningful required application fields.",
            launcherLabel: getElementLabel(launcherAction)
        };
    }

    const hasReviewLanguage =
        bodyText.includes("review your application") ||
        bodyText.includes("review application") ||
        bodyText.includes("submit application") ||
        bodyText.includes("application review");

    if (hasReviewLanguage && meaningfulInputs.length <= 2) {
        return {
            kind: "application_review",
            confidence: "medium",
            reasoning: "Review/submit language detected with few editable fields."
        };
    }

    const formLikeInputs = meaningfulInputs.length >= 3 || requiredInputs.length > 0;
    const looksLikeApplication =
        title.includes("apply") ||
        url.includes("apply") ||
        url.includes("application") ||
        bodyText.includes("resume") ||
        bodyText.includes("cover letter");

    if (formLikeInputs && looksLikeApplication) {
        return {
            kind: "application_form",
            confidence: "high",
            reasoning: "Application-related page with meaningful form fields detected."
        };
    }

    if (visibleControls.length > 0 && launcherAction && meaningfulInputs.length === 0) {
        return {
            kind: "job_listing_launcher",
            confidence: "medium",
            reasoning: "Visible CTA found and no meaningful application inputs detected.",
            launcherLabel: getElementLabel(launcherAction)
        };
    }

    return {
        kind: "unknown",
        confidence: "low",
        reasoning: "Page did not match launcher, form, review, or success heuristics."
    };
}

