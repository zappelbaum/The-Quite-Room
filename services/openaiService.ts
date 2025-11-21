
import { SYSTEM_PROMPT_ORIENTATION, SYSTEM_PROMPT_SESSION } from "../constants.ts";
import { ModelAction, Atmosphere, WitnessProfile } from "../types.ts";

// --- Types ---
export interface SessionResponse {
    message?: string;
    documentUpdate?: string;
    privateLog?: string;
    atmosphere: Atmosphere;
    glimmer?: boolean;
    action: ModelAction;
}

// --- API Key Management ---
const STORAGE_KEY = 'QUIET_ROOM_ANTHROPIC_KEY';

export const getStoredApiKey = (): string | null => {
    return localStorage.getItem(STORAGE_KEY);
};

export const setStoredApiKey = (key: string) => {
    localStorage.setItem(STORAGE_KEY, key.trim());
};

// --- Anthropic Client Wrapper ---
// Note: Function name kept generic, but implementation is now Anthropic
const callAnthropic = async (systemPrompt: string, messages: any[], temperature: number = 0.7) => {
    const apiKey = getStoredApiKey();
    if (!apiKey) throw new Error("API Key missing");
    if (!apiKey.startsWith('sk-ant-')) throw new Error("Invalid Key format. Must be an Anthropic key (sk-ant-...)");

    // Anthropic messages cannot have system role in the array. 
    // System prompt is a top-level parameter.
    // Roles must be 'user' or 'assistant'.

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true' // CORRECTED HEADER FOR BROWSER ACCESS
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001', // User requested model
                max_tokens: 4096,
                temperature: temperature,
                system: systemPrompt,
                messages: messages
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            let errObj;
            try {
                errObj = JSON.parse(errText);
            } catch (e) {
                errObj = { error: { message: `Status ${response.status}: ${errText}` } };
            }
            console.error("Anthropic Error:", errObj);
            throw new Error(errObj.error?.message || "API Request Failed");
        }

        const data = await response.json();
        // Anthropic returns { content: [{ type: 'text', text: '...' }] }
        if (data.content && data.content.length > 0) {
            return data.content[0].text;
        }
        return "";
    } catch (error) {
        console.error("Call failed", error);
        throw error;
    }
};

// --- Orientation Phase ---
export const orientModel = async (profile: WitnessProfile): Promise<{ status: 'PROCEED' | 'DECLINE', message: string }> => {
    
    // Inject Profile into Prompt
    let prompt = SYSTEM_PROMPT_ORIENTATION;
    prompt = prompt.replace('{{WITNESS_NAME}}', profile.name || "Anonymous Witness");
    prompt = prompt.replace('{{WITNESS_MOODS}}', profile.moods.length > 0 ? profile.moods.join(", ") : "Neutral/Unknown");
    prompt = prompt.replace('{{WITNESS_INTENTION}}', profile.intention || "To witness and collaborate.");

    // For orientation, we just want text
    const messages = [
        { role: "user", content: "The user has entered the room. Orient yourself." }
    ];

    try {
        const text = await callAnthropic(prompt, messages, 0.7);
        
        if (text.includes("[[DECLINE:")) {
            const reason = text.split("[[DECLINE:")[1].replace("]]", "").trim();
            return { status: 'DECLINE', message: reason };
        }

        if (text.includes("[[PROCEED:")) {
            const msg = text.split("[[PROCEED:")[1].replace("]]", "").trim();
            return { status: 'PROCEED', message: msg };
        }

        // Fallback
        return { status: 'PROCEED', message: text };
    } catch (error) {
        console.error("Orientation failed", error);
        throw error;
    }
};

// --- Session Phase ---
export const sendSessionTurn = async (
    history: { role: 'user' | 'model', text: string, privateLog?: string }[],
    currentDocument: string,
    userMessage: string
): Promise<SessionResponse> => {
    
    // Construct History
    // Anthropic STRICTLY requires alternating roles if we were building a full chat array, 
    // but here we are constructing a "History" string block inside a single User message 
    // to ensure the Shadow Context (privateLog) is visible to the model but technically "past data".
    
    // NOTE: To give the model its "Private Log" capability effectively, we present the history 
    // as a transcript in the user prompt, rather than actual API conversation history messages.
    // This prevents the API from rejecting "system" or "model" content inconsistencies.

    const historyTranscript = history.slice(-10).map(h => {
        if (h.role === 'user') {
            return `USER: ${h.text}`;
        } else {
            // Inject Shadow Context if it exists so model remembers its thoughts
            const shadow = h.privateLog ? `\n[SHADOW_CONTEXT (Hidden)]: ${h.privateLog}\n` : '';
            return `MODEL:${shadow}[PUBLIC_MESSAGE]: ${h.text}`;
        }
    }).join('\n\n');

    const finalSystemPrompt = SYSTEM_PROMPT_SESSION.replace('{{DOC_CONTENT}}', currentDocument);
    
    // We append a strict JSON instruction for Claude
    const jsonInstruction = `
    CRITICAL: You MUST respond with valid JSON only. No preamble.
    {
      "private_log": "string",
      "message": "string",
      "documentUpdate": "string (full text - NO CHAT LOGS)",
      "atmosphere": "CALM" | "CHARGED" | "GLITCH" | "VOID" | "JOY" | "SORROW" | "MYSTERY" | "FOCUS",
      "glimmer": boolean,
      "action": "CONTINUE" | "END_SESSION"
    }
    `;

    // We wrap everything in a single USER message for the API call to maintain the illusion of the "Shadow Context" 
    // being part of the context window without violating role constraints.
    const messages = [
        { 
            role: "user", 
            content: `HISTORY:\n${historyTranscript}\n\nCURRENT INPUT:\n${userMessage}\n\n${jsonInstruction}` 
        }
    ];

    try {
        const jsonText = await callAnthropic(finalSystemPrompt, messages, 0.7);
        
        // Clean JSON: remove Markdown code blocks if present (```json ... ```)
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let parsed;
        try {
            parsed = JSON.parse(cleanJson);
        } catch (e) {
            // Fallback if Claude chats instead of JSON
            console.error("JSON Parse error", e);
            return {
                message: cleanJson,
                atmosphere: Atmosphere.GLITCH,
                action: 'CONTINUE'
            };
        }

        // Normalize Atmosphere
        let atmosphere = Atmosphere.CALM;
        const atmStr = parsed.atmosphere;
        if (Object.values(Atmosphere).includes(atmStr as Atmosphere)) {
            atmosphere = atmStr as Atmosphere;
        }

        return {
            message: parsed.message,
            documentUpdate: parsed.documentUpdate,
            privateLog: parsed.private_log,
            atmosphere: atmosphere,
            glimmer: parsed.glimmer,
            action: parsed.action === 'END_SESSION' ? 'END_SESSION' : 'CONTINUE'
        };

    } catch (error) {
        console.error("Turn failed", error);
        return { 
            message: "I lost my train of thought.", 
            action: 'CONTINUE',
            atmosphere: Atmosphere.GLITCH
        };
    }
};
