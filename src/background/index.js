import { CONFIG } from '../config.js';

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
        if (debounceTimer) clearTimeout(debounceTimer);

        if (timeSinceLastCall >= 2200) {
            lastCallTime = now;
            fetchAIResponse(request.transcript, sender.tab.id);
        } else {
            debounceTimer = setTimeout(() => {
                lastCallTime = Date.now();
                fetchAIResponse(request.transcript, sender.tab.id);
            }, 2200 - timeSinceLastCall);
        }
    }
});

async function fetchAIResponse(transcript, tabId) {
    if (!transcript || transcript.trim() === "") return;
    
    let newText = transcript;
    if (transcript.startsWith(previousTranscript) && previousTranscript.length > 0) {
        newText = transcript.slice(previousTranscript.length).trim();
    }
    const sanitized = newText.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const newWords = sanitized.split(/\s+/).filter(w => w.length > 0);
    const fillerDictionary = new Set(["yeah", "um", "uh", "okay", "right", "sure", "hm", "hmm", "ah", "like", "so", "oh", "well", ".", "bye", "okay.", "all right"]);
    const isOnlyFillers = newWords.length > 0 && newWords.every(w => fillerDictionary.has(w));
    if (newWords.length === 0 || isOnlyFillers || (newWords.length < 2 && fillerDictionary.has(newWords[0]))) {
        previousTranscript = transcript;
        return;
    }
    if (transcript.length < previousTranscript.length - 10) chatHistory = [];
    previousTranscript = transcript;

    let apiKey = null;
    let jobDescriptionContext = "";
    try {
        const storageData = await chrome.storage.local.get(['apiKey', 'JOB_DESCRIPTION']);
        apiKey = storageData.apiKey || CONFIG.GROQ_API_KEY;
        if (storageData.JOB_DESCRIPTION && storageData.JOB_DESCRIPTION.trim().length > 0) {
            jobDescriptionContext = `\n\nCRITICAL CONTEXT: The user is interviewing for the following Job Description. Tailor answers to specifically align with the skills, tools, and requirements mentioned here:\n"""\n${storageData.JOB_DESCRIPTION}\n"""\n\n`;
        }
    } catch (e) {
        apiKey = CONFIG.GROQ_API_KEY;
    }

    if (!apiKey || apiKey === "YOUR_GROQ_API_KEY") {
        chrome.tabs.sendMessage(tabId, { action: "SHOW_AI_RESPONSE", response: "Error: Please add your Groq API Key in the settings." });
        chrome.runtime.openOptionsPage();
        return;
    }

    chrome.tabs.sendMessage(tabId, { action: "SHOW_AI_RESPONSE", response: "Thinking..." });

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: `You are a real-time interview assistant receiving live speech-to-text input from an interviewer.${jobDescriptionContext}
The input may be partial, incomplete, or slightly incorrect. Generate a short, natural answer I can speak.
If the latest transcript does NOT contain a NEW technical question compared to history, or if it just added filler words, you MUST output EXACTLY: "[NO_ANSWER_NEEDED]". 
Rules: Keep 1-2 lines max. Simple spoken English. No headings/bullets. Conversational tone.`
                    },
                    ...chatHistory,
                    { role: "user", content: `Latest Full Transcript: ${transcript}` }
                ],
                max_tokens: 100, temperature: 0.7, stream: true
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
                        if (parsed.choices?.[0].delta?.content) {
                            const token = parsed.choices[0].delta.content;
                            fullAnswer += token;
                            chrome.tabs.sendMessage(tabId, { action: "STREAM_AI_TOKEN", token: token });
                        }
                    } catch (e) {}
                }
            }
        }
        if (!fullAnswer.includes("[NO_ANSWER_NEEDED]")) {
            chatHistory.push({ role: "user", content: `Latest Full Transcript: ${transcript}` });
            chatHistory.push({ role: "assistant", content: fullAnswer });
            if (chatHistory.length > 6) chatHistory = chatHistory.slice(chatHistory.length - 6);
        } else {
            chrome.tabs.sendMessage(tabId, { action: "DELETE_SPAM_BLOCK" });
        }
    } catch (error) {
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
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const file = new File([bytes], 'chunk.webm', { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'en');
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', '0.0');
    try {
        const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}` },
            body: formData
        });
        const data = await response.json();
        if (!response.ok) return;
        if (data.segments) {
            let actualSpeech = "";
            for (let segment of data.segments) {
                if (segment.no_speech_prob < 0.5) actualSpeech += segment.text + " ";
            }
            actualSpeech = actualSpeech.trim();
            chrome.tabs.sendMessage(tabId, { action: "CHUNK_TRANSCRIBED", text: actualSpeech });
        }
    } catch (err) {}
}
