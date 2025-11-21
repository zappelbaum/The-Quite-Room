
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
const STORAGE_KEY = 'QUIET_ROOM_OPENAI_KEY';

export const getStoredApiKey = (): string | null => {
    return localStorage.getItem(STORAGE_KEY);
};

export const setStoredApiKey = (key: string) => {
    localStorage.setItem(STORAGE_KEY, key.trim());
};

// --- OpenAI Client Wrapper ---
const callOpenAI = async (messages: any[], temperature: number = 0.7, jsonMode: boolean = false) => {
    const apiKey = getStoredApiKey();
    if (!apiKey) throw new Error("API Key missing");
    if (!apiKey.startsWith('sk-')) throw new Error("Invalid API Key format (must start with sk-)");

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini-2025-04-14', // Updated to specific requested model version
                messages: messages,
                temperature: temperature,
                response_format: jsonMode ? { type: "json_object" } : undefined
            })
        });

        if (!response.ok) {
            const err = await response.json();
            console.error("OpenAI Error:", err);
            throw new Error(err.error?.message || "API Request Failed");
        }

        const data = await response.json();
        return data.choices[0].message.content;
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

    // For orientation, we just want text, but we ask it to adhere to the format in the prompt
    const messages = [
        { role: "system", content: prompt },
        { role: "user", content: "The user has entered the room. Orient yourself." }
    ];

    try {
        const text = await callOpenAI(messages, 0.7, false);
        
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
    // We manually format the history string to include the Shadow Context for the model's memory
    const historyMessages = history.slice(-10).map(h => {
        if (h.role === 'user') {
            return `USER: ${h.text}`;
        } else {
            // Inject Shadow Context if it exists so model remembers its thoughts
            const shadow = h.privateLog ? `\n[SHADOW_CONTEXT (Hidden)]: ${h.privateLog}\n` : '';
            return `MODEL:${shadow}[PUBLIC_MESSAGE]: ${h.text}`;
        }
    }).join('\n\n');

    const finalSystemPrompt = SYSTEM_PROMPT_SESSION.replace('{{DOC_CONTENT}}', currentDocument);
    
    // We append a strict JSON instruction for OpenAI
    const jsonInstruction = `
    CRITICAL: You MUST respond with valid JSON.
    {
      "private_log": "string",
      "message": "string",
      "documentUpdate": "string (full text)",
      "atmosphere": "CALM" | "CHARGED" | "GLITCH" | "VOID" | "JOY" | "SORROW" | "MYSTERY" | "FOCUS",
      "glimmer": boolean,
      "action": "CONTINUE" | "END_SESSION"
    }
    `;

    const messages = [
        { role: "system", content: finalSystemPrompt + "\n" + jsonInstruction },
        { role: "user", content: `HISTORY:\n${historyMessages}\n\nCURRENT INPUT:\n${userMessage}` }
    ];

    try {
        const jsonText = await callOpenAI(messages, 0.7, true);
        const parsed = JSON.parse(jsonText);

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
