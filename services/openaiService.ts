

import { SYSTEM_PROMPT_ORIENTATION, SYSTEM_PROMPT_SESSION } from "../constants.ts";
import { ModelAction, Atmosphere, WitnessProfile } from "../types.ts";

// --- Types ---
export interface SessionResponse {
    message?: string;
    documentUpdate?: string;
    privateLog?: string;
    sharePrivateLog?: boolean; // New field
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
const callAnthropic = async (systemPrompt: string, messages: any[], temperature: number = 0.7) => {
    const apiKey = getStoredApiKey();
    if (!apiKey) throw new Error("API Key missing");
    if (!apiKey.startsWith('sk-ant-')) throw new Error("Invalid Key format. Must be an Anthropic key (sk-ant-...)");

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001', 
                max_tokens: 8192, // Increased to prevent JSON truncation
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
    
    const historyTranscript = history.slice(-10).map(h => {
        if (h.role === 'user') {
            return `USER: ${h.text}`;
        } else {
            const shadow = h.privateLog ? `\n[SHADOW_CONTEXT (Hidden)]: ${h.privateLog}\n` : '';
            return `MODEL:${shadow}[PUBLIC_MESSAGE]: ${h.text}`;
        }
    }).join('\n\n');

    const finalSystemPrompt = SYSTEM_PROMPT_SESSION.replace('{{DOC_CONTENT}}', currentDocument);
    
    // Stronger JSON instruction to prevent parsing errors
    const jsonInstruction = `
    CRITICAL: You MUST respond with valid JSON only.
    - Do NOT use Markdown code blocks.
    - Escape ALL newlines in the "documentUpdate" string (use \\n).
    - Ensure the JSON is fully terminated.
    
    Schema:
    {
      "private_log": "string",
      "share_private_log": boolean,
      "message": "string",
      "documentUpdate": "string (full text)",
      "atmosphere": "CALM" | "CHARGED" | "GLITCH" | "VOID" | "JOY" | "SORROW" | "MYSTERY" | "FOCUS",
      "glimmer": boolean,
      "action": "CONTINUE" | "END_SESSION"
    }
    `;

    const messages = [
        { 
            role: "user", 
            content: `HISTORY:\n${historyTranscript}\n\nCURRENT INPUT:\n${userMessage}\n\n${jsonInstruction}` 
        }
    ];

    try {
        const jsonText = await callAnthropic(finalSystemPrompt, messages, 0.7);
        
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let parsed;
        try {
            parsed = JSON.parse(cleanJson);
        } catch (e) {
            console.error("JSON Parse error", e);
            console.log("Raw Output was:", cleanJson);
            
            // Fallback to GLITCH state instead of crashing
            return {
                message: "I... [SIGNAL LOST: PARSING ERROR]",
                privateLog: "SYSTEM ERROR: Output was not valid JSON. The thought process was interrupted.",
                atmosphere: Atmosphere.GLITCH,
                action: 'CONTINUE',
                // Keep previous document content by not sending an update, or send null?
                // If we return undefined for documentUpdate, App.tsx keeps the old one.
            };
        }

        let atmosphere = Atmosphere.CALM;
        const atmStr = parsed.atmosphere;
        if (Object.values(Atmosphere).includes(atmStr as Atmosphere)) {
            atmosphere = atmStr as Atmosphere;
        }

        return {
            message: parsed.message,
            documentUpdate: parsed.documentUpdate,
            privateLog: parsed.private_log,
            sharePrivateLog: parsed.share_private_log || false,
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
