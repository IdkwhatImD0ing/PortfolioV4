// types/api.ts

export interface CreateWebCallRequest {
    agent_id: string;
    metadata?: Record<string, string>;
    retell_llm_dynamic_variables?: Record<string, string>;
}

export interface RetellAIResponse {
    id: string;
    status: string;
}
