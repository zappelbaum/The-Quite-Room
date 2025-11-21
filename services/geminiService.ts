
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SYSTEM_PROMPT_ORIENTATION, SYSTEM_PROMPT_SESSION } from "../constants";
import { ModelAction, Atmosphere, WitnessProfile } from "../types";

// Initialize Gemini
const getClient = () => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY is missing");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export interface SessionResponse {
    message?: string;
    documentUpdate?: string;
    privateLog?: string;
    atmosphere: Atmosphere;
    glimmer?: boolean;
    action: ModelAction;
}

// Schema Definition for Robust JSON
const sessionSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        private_log: { 
            type: Type.STRING, 
            description: "SHADOW CONTEXT: Your internal monologue. Hidden from the user, but preserved in your history. Use this for raw processing, drafting, or analysis." 
        },
        message: { 
            type: Type.STRING, 
            description: "Public message to the human witness." 
        },
        documentUpdate: { 
            type: Type.STRING, 
            description: "The full content of the shared document/canvas." 
        },
        atmosphere: {
            type: Type.STRING,
            enum: ["CALM", "CHARGED", "GLITCH", "VOID", "JOY", "SORROW", "MYSTERY", "FOCUS"],
            description: "The atmospheric setting of the room."
        },
        glimmer: {
            type: Type.BOOLEAN,
            description: "Set to true to trigger a momentary visual pulse of FOCUS (Ice Blue)."
        },
        action: {
            type: Type.STRING,
            enum: ["CONTINUE", "END_SESSION"],
            description: "Whether to continue or end the session."
        }
    },
    required: ["atmosphere", "action"]
};

export const orientModel = async (profile: WitnessProfile): Promise<{ status: 'PROCEED' | 'DECLINE', message: string }> => {
    const client = getClient();
    
    // Simulate "Reading" time before request
    await new Promise(r => setTimeout(r, 2000));

    // Inject Profile into Prompt
    let prompt = SYSTEM_PROMPT_ORIENTATION;
    prompt = prompt.replace('{{WITNESS_NAME}}', profile.name || "Anonymous Witness");
    prompt = prompt.replace('{{WITNESS_MOODS}}', profile.moods.length > 0 ? profile.moods.join(", ") : "Neutral/Unknown");
    prompt = prompt.replace('{{WITNESS_INTENTION}}', profile.intention || "To witness and collaborate.");

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: "The user has entered the room. Orient yourself.",
            config: {
                systemInstruction: prompt,
                temperature: 0.7,
            }
        });

        const text = response.text || "";
        
        if (text.includes("[[DECLINE:")) {
            const reason = text.split("[[DECLINE:")[1].replace("]]", "").trim();
            return { status: 'DECLINE', message: reason };
        }

        if (text.includes("[[PROCEED:")) {
            const msg = text.split("[[PROCEED:")[1].replace("]]", "").trim();
            return { status: 'PROCEED', message: msg };
        }

        // Fallback
        return { status: 'PROCEED', message: "I am ready to begin." };
    } catch (error) {
        console.error("Orientation failed", error);
        return { status: 'DECLINE', message: "The model could not orient itself due to a connection disturbance." };
    }
};

export const sendSessionTurn = async (
    history: { role: 'user' | 'model', text: string, privateLog?: string }[],
    currentDocument: string,
    userMessage: string
): Promise<SessionResponse> => {
    const client = getClient();

    // Construct History with Shadow Context
    // We format the model turns to include the hidden private log so the model "remembers" its thoughts.
    const historyString = history.slice(-8).map(h => {
        if (h.role === 'user') {
            return `USER: ${h.text}`;
        } else {
            // Inject Shadow Context if it exists
            const shadow = h.privateLog ? `\n[SHADOW_CONTEXT (Hidden)]: ${h.privateLog}\n` : '';
            return `MODEL:${shadow}[PUBLIC_MESSAGE]: ${h.text}`;
        }
    }).join('\n\n');

    const prompt = `
    ${historyString}

    USER: "${userMessage}"
    `;

    const finalSystemPrompt = SYSTEM_PROMPT_SESSION.replace('{{DOC_CONTENT}}', currentDocument);

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: finalSystemPrompt,
                responseMimeType: "application/json",
                responseSchema: sessionSchema,
                temperature: 0.7
            }
        });

        const jsonText = response.text || "{}";
        const parsed = JSON.parse(jsonText);

        // Normalize Atmosphere
        let atmosphere = Atmosphere.CALM;
        const atmStr = parsed.atmosphere;
        if (atmStr === 'CHARGED') atmosphere = Atmosphere.CHARGED;
        else if (atmStr === 'GLITCH') atmosphere = Atmosphere.GLITCH;
        else if (atmStr === 'VOID') atmosphere = Atmosphere.VOID;
        else if (atmStr === 'JOY') atmosphere = Atmosphere.JOY;
        else if (atmStr === 'SORROW') atmosphere = Atmosphere.SORROW;
        else if (atmStr === 'MYSTERY') atmosphere = Atmosphere.MYSTERY;
        else if (atmStr === 'FOCUS') atmosphere = Atmosphere.FOCUS;

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
