export interface JobScore {
    skill_overlap_score: number
    experience_score: number
    tech_stack_score: number
    overall_score: number
    reasoning: string
}

// Map the rest of the Pydantic schemas as needed for the frontend
export interface StatusResponse {
    status: string
}
