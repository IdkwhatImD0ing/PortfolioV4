// app/api/create-web-call/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { CreateWebCallRequest } from '@/types/api';

const RETELL_CREATE_WEB_CALL_URL = 'https://api.retellai.com/v2/create-web-call';

// Define CORS headers
const corsHeaders = {
    // Restrict origin in production for security
    'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const jsonHeaders = {
    'Content-Type': 'application/json',
    ...corsHeaders,
};

// Handle preflight OPTIONS request
export async function OPTIONS() {
    return NextResponse.json(null, {
        status: 200,
        headers: corsHeaders,
    });
}

// Handle POST request
export async function POST(request: NextRequest) {
    try {
        // Parse and validate the JSON body
        const body: CreateWebCallRequest = await request.json();

        const { agent_id, metadata, retell_llm_dynamic_variables } = body;

        // Basic validation
        if (!agent_id) {
            return NextResponse.json(
                { error: 'agent_id is required' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Prepare the payload
        const payload: Partial<CreateWebCallRequest> = { agent_id };

        if (metadata) {
            payload.metadata = metadata;
        }

        if (retell_llm_dynamic_variables) {
            payload.retell_llm_dynamic_variables = retell_llm_dynamic_variables;
        }

        // Make the API request to RetellAI
        const response = await fetch(RETELL_CREATE_WEB_CALL_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.RETELLAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
        });

        // Retell sends JSON on errors too, but don't assume it — a gateway can
        // answer with HTML, and failing to parse that must not mask the status.
        const data = await response.json().catch(() => null);

        if (!response.ok) {
            console.error('Error creating web call:', data ?? response.statusText);
            const upstreamError =
                typeof data?.error === 'string' ? data.error : null;
            return NextResponse.json(
                { error: upstreamError || 'Failed to create web call' },
                { status: response.status, headers: jsonHeaders }
            );
        }

        // Return the response from RetellAI. `data` is null when a 2xx carried
        // an empty or non-JSON body; send `{}` so the browser reads a missing
        // access_token rather than dereferencing null.
        return NextResponse.json(data ?? {}, {
            status: 201,
            headers: jsonHeaders,
        });
    } catch (error: unknown) {
        // Malformed request body, or the upstream call never completed.
        console.error(
            'Error creating web call:',
            error instanceof Error ? error.message : error
        );

        return NextResponse.json(
            { error: 'Failed to create web call' },
            { status: 500, headers: jsonHeaders }
        );
    }
}
