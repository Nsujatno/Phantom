import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
    matches: ["https://*.indeed.com/*"]
}

console.log("Extractor content script injected.")
