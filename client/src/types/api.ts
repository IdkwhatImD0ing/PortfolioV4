// types/api.ts

export interface CreateWebCallRequest {
    agent_id: string;
    metadata?: Record<string, string>;
    retell_llm_dynamic_variables?: Record<string, string>;
}

/** The fields of Retell's v3 create-web-call response the browser actually
 *  reads. Retell returns more; the proxy passes the whole body through
 *  untouched. The SDK needs all four to join a v3 call. */
export interface RetellAIResponse {
    call_id: string;
    access_token: string;
    transport?: 'livekit' | 'gateway';
    ice_servers?: RTCIceServer[];
}
