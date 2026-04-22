let debounceTimer = null;
let lastCallTime = 0;
let chatHistory = [];
let previousTranscript = "";
const OFFSCREEN_PATH = 'offscreen.html';

async function hasOffscreenDocument() {
    if (!chrome.runtime.getContexts) return false;

    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    return contexts.length > 0;
}

async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) return;

    await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['AUDIO_PLAYBACK', 'USER_MEDIA'],
        justification: 'Play captured tab audio to the speakers while transcribing it.'
    });
}

async function stopOffscreenPlayback() {
    if (!(await hasOffscreenDocument())) return;

    await chrome.runtime.sendMessage({ action: 'OFFSCREEN_STOP_AUDIO' }).catch(() => {});
    await chrome.offscreen.closeDocument().catch(() => {});
}

async function setOffscreenPaused(paused) {
    if (!(await hasOffscreenDocument())) {
        return { ok: false, error: 'Offscreen tab engine is not active.' };
    }

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'OFFSCREEN_SET_PAUSED',
            paused
        });
        return response || { ok: false, error: 'No response from offscreen document.' };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

async function startOffscreenTabEngine(tabId) {
    await stopOffscreenPlayback().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 150));
    await ensureOffscreenDocument();

    return new Promise((resolve) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, async (streamId) => {
            if (chrome.runtime.lastError || !streamId) {
                resolve({
                    ok: false,
                    error: chrome.runtime.lastError?.message || "Failed to create a playback stream."
                });
                return;
            }

            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'OFFSCREEN_START_TAB_ENGINE',
                    streamId,
                    tabId
                });
                resolve(response || { ok: false, error: 'No response from offscreen playback document.' });
            } catch (error) {
                resolve({ ok: false, error: error.message });
            }
        });
    });
}

chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_LISTENING" }, (res) => {
        if (chrome.runtime.lastError) {
            console.warn("Content script probably not injected in this tab. Try refreshing the page.");
        } else {
            // Reset memory on every toggle to strictly enforce a fresh conversation
            chatHistory = [];
            previousTranscript = "";
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "TRANSCRIBE_CHUNK") {
        const tabId = request.tabId || sender.tab?.id;
        if (!tabId) {
            sendResponse?.({ ok: false, error: "Missing tab id for transcription." });
            return false;
        }

        transcribeAudioWithGroq(request.audioData, tabId).catch(console.error);
    } else if (request.action === "GET_TAB_AUDIO_STREAM_ID") {
        const tabId = sender.tab?.id;
        if (!tabId) {
            sendResponse({ ok: false, error: "Unable to find the active tab for audio capture." });
            return false;
        }

        chrome.tabCapture.getMediaStreamId({
            targetTabId: tabId,
            consumerTabId: tabId
        }, (streamId) => {
            if (chrome.runtime.lastError || !streamId) {
                sendResponse({
                    ok: false,
                    error: chrome.runtime.lastError?.message || "Failed to create a tab audio stream."
                });
                return;
            }

            sendResponse({ ok: true, streamId });
        });

        return true;
    } else if (request.action === "START_TAB_AUDIO_ENGINE") {
        const tabId = sender.tab?.id;
        if (!tabId) {
            sendResponse({ ok: false, error: "Unable to find the active tab for tab audio engine." });
            return false;
        }

        startOffscreenTabEngine(tabId)
            .then(sendResponse)
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    } else if (request.action === "SET_TAB_AUDIO_PAUSED") {
        setOffscreenPaused(Boolean(request.paused))
            .then(sendResponse)
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    } else if (request.action === "STOP_LISTENING") {
        chatHistory = [];
        previousTranscript = "";
        stopOffscreenPlayback().catch(() => {});
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
    } else if (request.action === "isCaptured") {
        chrome.tabCapture.getCapturedTabs().then(tabs => {
            const isCaptured = tabs.some(tab => tab.tabId === sender.tab.id);
            sendResponse({isCaptured});
        }).catch(() => sendResponse({isCaptured: false}));
        return true;
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

    let apiKey = "";
    let jobDescriptionContext = "";
    try {
        const storageData = await chrome.storage.local.get(['apiKey', 'JOB_DESCRIPTION']);
        apiKey = (storageData.apiKey || "").trim();
        if (storageData.JOB_DESCRIPTION && storageData.JOB_DESCRIPTION.trim().length > 0) {
            jobDescriptionContext = `\n\nCRITICAL CONTEXT: The user is interviewing for the following Job Description. Tailor answers to specifically align with the skills, tools, and requirements mentioned here:\n"""\n${storageData.JOB_DESCRIPTION}\n"""\n\n`;
        }
    } catch (e) {
        apiKey = "";
    }

    if (!apiKey) {
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
    let apiKey = "";
    try {
        const storageData = await chrome.storage.local.get(['apiKey']);
        apiKey = (storageData.apiKey || "").trim();
    } catch (e) {
        apiKey = "";
    }

    if (!apiKey) {
        chrome.tabs.sendMessage(tabId, {
            action: "SHOW_AI_RESPONSE",
            response: "Error: Please add your Groq API Key in the settings."
        });
        chrome.runtime.openOptionsPage();
        return;
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
                // Extremely strict probability threshold (0.25) to kill Whisper V3 hallucinations
                if (segment.no_speech_prob < 0.25) actualSpeech += segment.text + " ";
            }
            actualSpeech = actualSpeech.trim();
            chrome.tabs.sendMessage(tabId, { action: "CHUNK_TRANSCRIBED", text: actualSpeech });
        }
    } catch (err) {}
}
