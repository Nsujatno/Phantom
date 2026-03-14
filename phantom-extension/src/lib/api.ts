import type { StatusResponse } from "./types"

const API_BASE_URL = "http://localhost:8000"

export async function getPipelineStatus(): Promise<StatusResponse> {
    const res = await fetch(`${API_BASE_URL}/status`, { method: "POST" })
    if (!res.ok) throw new Error("Failed to get status")
    return res.json()
}

export async function stopPipeline(): Promise<StatusResponse> {
    const res = await fetch(`${API_BASE_URL}/stop`, { method: "POST" })
    if (!res.ok) throw new Error("Failed to stop pipeline")
    return res.json()
}
