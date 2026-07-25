// types/api.ts

export interface CreateWebCallRequest {
    agent_id: string;
    metadata?: Record<string, string>;
    retell_llm_dynamic_variables?: Record<string, string>;
}

/** The fields of Retell's create-web-call response the browser actually reads.
 *  Retell returns more; the proxy passes the whole body through untouched. */
export interface RetellAIResponse {
    call_id: string;
    access_token: string;
}
