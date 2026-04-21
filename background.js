import { CONFIG } from './config.js';

let debounceTimer = null;
let lastCallTime = 0;
let chatHistory = [];
let previousTranscript = "";

chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_LISTENING" }, (res) => {
        if (chrome.runtime.lastError) {
            console.warn("Content script probably not injected in this tab. Try refreshing the page.");
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "TRANSCRIBE_CHUNK") {
        transcribeAudioWithGroq(request.audioData, sender.tab.id).catch(console.error);
    } else if (request.action === "PROCESS_TRANSCRIPT") {
        const now = Date.now();
        const timeSinceLastCall = now - lastCallTime;

        // Clear any queued request because a newer transcript arrived
        if (debounceTimer) clearTimeout(debounceTimer);

        if (timeSinceLastCall >= 2200) {
            // It has been 2.2+ seconds! Process immediately instead of waiting for silence.
            lastCallTime = now;
            fetchAIResponse(request.transcript, sender.tab.id);
        } else {
            // We are talking fast. Queue it to fire exactly when the 2.2s cooldown finishes.
            debounceTimer = setTimeout(() => {
                lastCallTime = Date.now();
                fetchAIResponse(request.transcript, sender.tab.id);
            }, 2200 - timeSinceLastCall);
        }
    }
});

async function fetchAIResponse(transcript, tabId) {

    console.log("Transcript testing log:", transcript);

    if (!transcript || transcript.trim() === "") return;

    // Mechanically extract the absolute newest phrasing to run strict regex analysis against it
    let newText = transcript;
    if (transcript.startsWith(previousTranscript) && previousTranscript.length > 0) {
        newText = transcript.slice(previousTranscript.length).trim();
    }

    // Evaluate if the speaker is merely emitting filler gaps without contributing new technical contexts
    const sanitized = newText.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const newWords = sanitized.split(/\s+/).filter(w => w.length > 0);
    const fillerDictionary = new Set(["yeah", "um", "uh", "okay", "right", "sure", "hm", "hmm", "ah", "like", "so", "oh", "well", ".", "bye", "okay.", "all right"]);
    const isOnlyFillers = newWords.length > 0 && newWords.every(w => fillerDictionary.has(w));

    // Completely drop the API request if the UI hasn't logged anything proper
    if (newWords.length === 0 || isOnlyFillers || newWords.length < 2 && fillerDictionary.has(newWords[0])) {
        previousTranscript = transcript;
        return; // Abort LLM entirely to save bandwidth & API logs
    }

    // Detect if user dynamically cleared the transcript UI buffer (shrink) and mechanically reset LLM memory
    if (transcript.length < previousTranscript.length - 10) {
        chatHistory = [];
    }
    previousTranscript = transcript;

    let apiKey = null;
    let jobDescriptionContext = "";
    try {
        const storageData = await chrome.storage.local.get(['apiKey', 'JOB_DESCRIPTION']);
        apiKey = storageData.apiKey || CONFIG.GROQ_API_KEY;
        if (storageData.JOB_DESCRIPTION && storageData.JOB_DESCRIPTION.trim().length > 0) {
            jobDescriptionContext = `\n\nCRITICAL CONTEXT: The user is interviewing for the following Job Description. You MUST tailor all of your technical answers to specifically align with the skills, tools, and requirements mentioned in this Job Description:\n"""\n${storageData.JOB_DESCRIPTION}\n"""\n\n`;
        }
    } catch (e) {
        apiKey = CONFIG.GROQ_API_KEY;
    }

    if (!apiKey || apiKey === "YOUR_GROQ_API_KEY") {
        chrome.tabs.sendMessage(tabId, { action: "SHOW_AI_RESPONSE", response: "Error: Please add your Groq API Key in the settings." });
        chrome.runtime.openOptionsPage();
        return;
    }

    // Tell the overlay we are thinking
    chrome.tabs.sendMessage(tabId, { action: "SHOW_AI_RESPONSE", response: "Thinking..." });

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant", // Fast, modern & Free model on Groq
                messages: [
                    {
                        role: "system",
                        content: `You are a real-time interview assistant receiving live speech-to-text input from an interviewer.${jobDescriptionContext}

The input may be partial, incomplete, or slightly incorrect.
Your goal is to instantly generate a short, natural answer I can speak during a live interview.

CRITICAL MEMORY & SPAM RULE:
You are given the chat history. To the user, the transcript is a single running conversation. 
If the user's latest transcript does NOT contain a NEW technical question compared to the history, or if it just added filler words ("yeah", "uh") to the same question you already answered, you MUST output EXACTLY the phrase: "[NO_ANSWER_NEEDED]". 
Do not repeat an answer to a question you already answered. Do not output anything else if no new answer is needed.

Rules:
- Keep answers 1–2 lines max
- Use simple spoken English
- No headings, no bullet points
- No long explanations

Tone:
- Human-like, confident, conversational`
                    },
                    ...chatHistory,
                    {
                        role: "user",
                        content: `Latest Full Transcript: ${transcript}`
                    }
                ],
                max_tokens: 100,
                temperature: 0.7,
                stream: true // Enable direct token-by-token streaming from Groq!
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error?.message || "Unknown API Error");
        }

        chrome.tabs.sendMessage(tabId, { action: "START_AI_STREAM" });

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullAnswer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    try {
                        const parsed = JSON.parse(line.slice(6));
                        if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].delta?.content) {
                            const token = parsed.choices[0].delta.content;
                            fullAnswer += token;
                            chrome.tabs.sendMessage(tabId, { action: "STREAM_AI_TOKEN", token: token });
                        }
                    } catch (e) {
                        // Safely ignore broken JSON fragments in the HTTP stream
                    }
                }
            }
        }

        // Push history to strictly maintain technical context framework so Llama doesn't repeat itself!
        if (!fullAnswer.includes("[NO_ANSWER_NEEDED]")) {
            chatHistory.push({ role: "user", content: `Latest Full Transcript: ${transcript}` });
            chatHistory.push({ role: "assistant", content: fullAnswer });
            if (chatHistory.length > 6) chatHistory = chatHistory.slice(chatHistory.length - 6); // Memory cap
        } else {
            // Signal frontend to delete the streaming block because it turned out to be a spam answer Drop command!
            chrome.tabs.sendMessage(tabId, { action: "DELETE_SPAM_BLOCK" });
        }
    } catch (error) {
        console.error("Groq API error:", error);
        chrome.tabs.sendMessage(tabId, { action: "SHOW_AI_RESPONSE", response: `Error: ${error.message}` });
    }
}

async function transcribeAudioWithGroq(base64Audio, tabId) {
    let apiKey = null;
    try {
        const storageData = await chrome.storage.local.get(['apiKey']);
        apiKey = storageData.apiKey || CONFIG.GROQ_API_KEY;
    } catch (e) {
        apiKey = CONFIG.GROQ_API_KEY;
    }

    if (!apiKey || apiKey === "YOUR_GROQ_API_KEY") {
        chrome.tabs.sendMessage(tabId, { action: "SHOW_AI_RESPONSE", response: "Error: Please add your Groq API Key in the settings." });
        chrome.runtime.openOptionsPage();
        return;
    }

    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const file = new File([bytes], 'chunk.webm', { type: 'audio/webm' });

    const formData = new FormData();
    formData.append('file', file);

    // Groq requires standard naming - Turbo handles ambient room silence significantly better than base v3
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'en');
    formData.append('response_format', 'verbose_json'); // Extract hardcore underlying AI metrics
    formData.append('temperature', '0.0'); // Force deterministic output
    // Removed 'prompt' parameter because Whisper V3 natively hallucinates prompt instructions as spoken audio during 100% silence

    try {
        const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Whisper API Error:", data);
            chrome.tabs.sendMessage(tabId, { action: "SHOW_AI_RESPONSE", response: `Whisper API Error: ${data.error?.message || response.statusText}` });
            return;
        }

        if (data.segments && data.segments.length > 0) {
            let actualSpeech = "";
            let silenceDropped = false;

            for (let segment of data.segments) {
                // If Whisper's own AI indicates this segment is >50% likely to be pure background silence/static, mathematically drop the hallucinated text!
                if (segment.no_speech_prob < 0.5) {
                    actualSpeech += segment.text + " ";
                } else {
                    silenceDropped = true;
                }
            }

            actualSpeech = actualSpeech.trim();
            if (actualSpeech) {
                chrome.tabs.sendMessage(tabId, { action: "CHUNK_TRANSCRIBED", text: actualSpeech });
            } else if (silenceDropped) {
                // Whisper hallucinated on static, but self-corrected. Forward the drop log to UI
                chrome.tabs.sendMessage(tabId, { action: "CHUNK_TRANSCRIBED", text: "" });
            }

        } else if (data.text) {
            // Unlikely fallback block if they change their API formatting
            chrome.tabs.sendMessage(tabId, { action: "CHUNK_TRANSCRIBED", text: data.text });
        }
    } catch (err) {
        console.error("Whisper API exception:", err);
    }
}
