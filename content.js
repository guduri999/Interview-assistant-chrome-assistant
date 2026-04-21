let recognition = null;
let isListening = false;
let currentEngine = 'whisper';
let overlay = null;
let textContainer = null;
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;
let activeMessageDiv = null;
let needsNewBlock = true;
let autoScrollEnabled = true;
let transcriptContainer = null;
let savedTranscriptHTML = "";
let savedAiOutputHTML = "";
let savedLogHTML = "";
let mediaRecorder = null;
let audioStream = null;
let fullTranscript = '';
let logContainer = null;
let isPaused = false;

function updateMicUI(isActive) {
    const dot = document.querySelector('.recording-dot');
    if (dot) {
        if (isActive) {
            dot.classList.add('active');
            dot.title = "Microphone is picking up sound...";
        } else {
            dot.classList.remove('active');
            dot.title = "Microphone is idle";
        }
    }
}

// Setup Overlay UI
function createOverlay() {
    if (document.getElementById('ai-interview-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'ai-interview-overlay';

    const header = document.createElement('div');
    header.id = 'ai-interview-header';

    const leftControls = document.createElement('div');
    leftControls.className = 'ai-controls-group';

    const autoScrollBtn = document.createElement('button');
    autoScrollBtn.id = 'ai-interview-autoscroll';
    autoScrollBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';
    autoScrollBtn.title = 'Toggle Auto-scroll';
    autoScrollBtn.onclick = () => {
        autoScrollEnabled = !autoScrollEnabled;
        autoScrollBtn.classList.toggle('off', !autoScrollEnabled);
        if (autoScrollEnabled) {
            textContainer.scrollTop = textContainer.scrollHeight;
        }
    };

    const clearBtn = document.createElement('button');
    clearBtn.id = 'ai-interview-clear';
    clearBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    clearBtn.title = 'Clear Chat';
    clearBtn.onclick = () => {
        if (textContainer) textContainer.innerHTML = '';
        if (transcriptContainer) transcriptContainer.innerHTML = '';
        if (logContainer) logContainer.innerHTML = '';
        savedTranscriptHTML = '';
        savedAiOutputHTML = '';
        savedLogHTML = '';
        fullTranscript = '';
        activeMessageDiv = null;
        needsNewBlock = true;
    };

    const pauseBtn = document.createElement('button');
    pauseBtn.id = 'ai-interview-pause';
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    pauseBtn.title = 'Pause Listening';
    pauseBtn.onclick = () => {
        isPaused = !isPaused;
        if (isPaused) {
            pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
            pauseBtn.title = 'Resume Listening';
            updateMicUI(false);
            pauseBtn.style.color = '#f44336';
        } else {
            pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
            pauseBtn.title = 'Pause Listening';
            updateMicUI(true);
            pauseBtn.style.color = 'white';
        }
    };

    leftControls.appendChild(autoScrollBtn);
    leftControls.appendChild(pauseBtn);
    leftControls.appendChild(clearBtn);

    const dragHandle = document.createElement('div');
    dragHandle.id = 'ai-interview-drag-handle';
    dragHandle.innerHTML = '<span class="recording-dot" title="Listening to microphone..."></span> AI Assistant';

    const rightControls = document.createElement('div');
    rightControls.className = 'ai-controls-group';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'ai-interview-close';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.title = 'Close Overlay';
    closeBtn.onclick = () => {
        stopListening();
    };

    rightControls.appendChild(closeBtn);

    header.appendChild(leftControls);
    header.appendChild(dragHandle);
    header.appendChild(rightControls);

    const bodyContainer = document.createElement('div');
    bodyContainer.id = 'ai-interview-body';

    const leftPane = document.createElement('div');
    leftPane.className = 'ai-interview-pane';

    const leftTitle = document.createElement('div');
    leftTitle.className = 'ai-interview-pane-title';
    leftTitle.innerText = 'Live Transcript';

    transcriptContainer = document.createElement('div');
    transcriptContainer.id = 'ai-interview-transcript';
    transcriptContainer.innerHTML = savedTranscriptHTML || '';

    leftPane.appendChild(leftTitle);
    leftPane.appendChild(transcriptContainer);

    const rightPane = document.createElement('div');
    rightPane.className = 'ai-interview-pane';

    const rightTitle = document.createElement('div');
    rightTitle.className = 'ai-interview-pane-title';
    rightTitle.innerText = 'AI Suggestions';

    textContainer = document.createElement('div');
    textContainer.id = 'ai-interview-text';
    textContainer.innerHTML = savedAiOutputHTML || '';

    rightPane.appendChild(rightTitle);
    rightPane.appendChild(textContainer);

    const bottomPane = document.createElement('div');
    bottomPane.className = 'ai-interview-pane bottom-pane';

    const bottomTitle = document.createElement('div');
    bottomTitle.className = 'ai-interview-pane-title';
    bottomTitle.innerText = 'Transcript Log';

    logContainer = document.createElement('div');
    logContainer.id = 'ai-interview-log';
    logContainer.innerHTML = savedLogHTML || '';

    bottomPane.appendChild(bottomTitle);
    bottomPane.appendChild(logContainer);

    bodyContainer.appendChild(leftPane);
    bodyContainer.appendChild(rightPane);
    overlay.appendChild(header);
    overlay.appendChild(bodyContainer);
    overlay.appendChild(bottomPane);
    document.body.appendChild(overlay);

    // Restore previous offset position!
    if (xOffset !== 0 || yOffset !== 0) {
        setTranslate(xOffset, yOffset, overlay);
    }

    // Make dragging work
    dragHandle.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', drag);
}

function removeOverlay() {
    if (overlay) {
        // Destroy all saved logs and history strings deliberately to enforce a fresh mount!
        savedTranscriptHTML = '';
        savedAiOutputHTML = '';
        savedLogHTML = '';
        fullTranscript = '';
        activeMessageDiv = null;
        needsNewBlock = true;
        
        overlay.remove();
        overlay = null;
        textContainer = null;
        transcriptContainer = null;
        logContainer = null;
    }
}

// Dragging logic
let rafPending = false;

function dragStart(e) {
    if (e.target.closest('#ai-interview-drag-handle')) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;
    }
}

function dragEnd(e) {
    if (!isDragging) return;
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
}

function drag(e) {
    if (isDragging) {
        e.preventDefault();

        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(() => {
                setTranslate(currentX, currentY, overlay);
                rafPending = false;
            });
        }
    }
}

function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
}

// Speech Recognition Logic via Dynamic VAD MediaRecorder Tracking
let vadInterval = null;
let silenceTimer = null;
let isSpeaking = false;
let currentChunks = [];
let audioContext = null;
let silenceAnalyser = null;

async function initWhisperEngine() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        // VAD Hardware Bindings
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContextConstructor();
        const source = audioContext.createMediaStreamSource(audioStream);
        silenceAnalyser = audioContext.createAnalyser();
        silenceAnalyser.fftSize = 512;
        source.connect(silenceAnalyser);

        mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = e => currentChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(currentChunks, { type: 'audio/webm' });
            currentChunks = []; // Clean for next phrase
            
            if (blob.size > 0 && isListening && !isPaused) {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    const base64AudioMessage = reader.result.split(',')[1];
                    const kb = Math.round(blob.size/1024);
                    
                    if (logContainer) {
                        const logMsg = document.createElement('div');
                        logMsg.style.marginBottom = '2px';
                        logMsg.style.color = '#888';
                        logMsg.style.fontSize = '12px';
                        logMsg.innerText = `[${new Date().toLocaleTimeString()}] [Debug] Processed Spoken Sentence (${kb}KB). Sending to Groq...`;
                        logContainer.appendChild(logMsg);
                        if (autoScrollEnabled) logContainer.scrollTop = logContainer.scrollHeight;
                    }

                    chrome.runtime.sendMessage({
                        action: "TRANSCRIBE_CHUNK",
                        audioData: base64AudioMessage
                    });
                };
            }
        };

        const pcmData = new Float32Array(silenceAnalyser.fftSize);
        let recordingStartTime = 0;

        vadInterval = setInterval(() => {
            if (!isListening || isPaused || !silenceAnalyser) return;

            silenceAnalyser.getFloatTimeDomainData(pcmData);
            let sumSquares = 0.0;
            for (let i = 0; i < pcmData.length; i++) {
                sumSquares += pcmData[i] * pcmData[i];
            }
            const rms = Math.sqrt(sumSquares / pcmData.length);
            
            if (rms > 0.005) {
                if (!isSpeaking) {
                    isSpeaking = true;
                    recordingStartTime = Date.now();
                    if (mediaRecorder.state === 'inactive') {
                        currentChunks = [];
                        mediaRecorder.start();
                        updateMicUI(true);
                        
                        if (logContainer) {
                            const logMsg = document.createElement('div');
                            logMsg.style.marginBottom = '2px';
                            logMsg.style.color = '#fff';
                            logMsg.style.fontSize = '12px';
                            logMsg.innerText = `[${new Date().toLocaleTimeString()}] [Debug] Microphone heard voice. Recording chunk...`;
                            logContainer.appendChild(logMsg);
                            if (autoScrollEnabled) logContainer.scrollTop = logContainer.scrollHeight;
                        }
                    }
                }
                
                // Continually push the silence barrier back while talking
                clearTimeout(silenceTimer);
                
                // If they are continuously talking without pausing long enough to trigger the breath-pause, 
                // forcefully slice the chunk every 7 seconds so they get live API text on screen accurately!
                if (Date.now() - recordingStartTime > 7000) {
                    isSpeaking = false; // Next 50ms tick will instantly spawn a new mic session
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                } else {
                    silenceTimer = setTimeout(() => {
                        isSpeaking = false;
                        if (mediaRecorder.state === 'recording') {
                            mediaRecorder.stop();
                            updateMicUI(false);
                        }
                    }, 1500); 
                }
            }
        }, 50);
    } catch (e) {
        console.error("Mic access denied or error:", e);
        updateMicUI(false);
        alert("Microphone permission denied! Please allow microphone access on this website first.");
        stopListening();
    }
}

function initNativeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Native Speech Recognition is not supported in this browser. Falling back to Whisper.");
        initWhisperEngine();
        return;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        if (isPaused || !isListening) return;

        let interimTranscript = '';
        let finalTranscriptStr = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscriptStr += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscriptStr) {
            let newText = finalTranscriptStr.trim();
            fullTranscript += (fullTranscript ? " " : "") + newText;
            
            if (transcriptContainer) {
                const msg = document.createElement('div');
                msg.className = 'transcript-msg final';
                msg.innerText = newText;
                transcriptContainer.appendChild(msg);
                if (autoScrollEnabled) transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
            }
            if (logContainer) {
                const logMsg = document.createElement('div');
                logMsg.style.marginBottom = '2px';
                logMsg.style.color = '#64ffda';
                logMsg.style.fontSize = '12px';
                logMsg.innerText = `[${new Date().toLocaleTimeString()}] [Native Engine] Processed Sentence. Translating with AI...`;
                logContainer.appendChild(logMsg);
                if (autoScrollEnabled) logContainer.scrollTop = logContainer.scrollHeight;
            }

            chrome.runtime.sendMessage({
                action: "PROCESS_TRANSCRIPT",
                transcript: fullTranscript
            });
        }
    };

    recognition.onstart = () => {
        if (!isPaused) updateMicUI(true);
        if (logContainer) {
            const logMsg = document.createElement('div');
            logMsg.style.marginBottom = '2px';
            logMsg.style.color = '#fff';
            logMsg.style.fontSize = '12px';
            logMsg.innerText = `[${new Date().toLocaleTimeString()}] [Debug] Native WebKit Tracking Started...`;
            logContainer.appendChild(logMsg);
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
            updateMicUI(false);
            stopListening();
        }
    };

    recognition.onend = () => {
        if (isListening && !isPaused) {
            recognition.start(); // Auto-restart continuous polling
        } else {
            updateMicUI(false);
        }
    };

    recognition.start();
}

function startListening() {
    if (!isListening) {
        isListening = true;
        createOverlay();
        
        chrome.storage.local.get(['TRANSCRIPTION_ENGINE'], (result) => {
            currentEngine = result.TRANSCRIPTION_ENGINE || 'whisper';
            
            if (currentEngine === 'whisper') {
                if (!audioStream) initWhisperEngine();
            } else {
                if (!recognition) initNativeSpeechRecognition();
                else recognition.start();
            }
        });
    }
}

function stopListening() {
    isListening = false;
    isPaused = false;
    isSpeaking = false;
    clearInterval(vadInterval);
    clearTimeout(silenceTimer);
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
        mediaRecorder = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
        silenceAnalyser = null;
    }
    if (recognition) {
        recognition.stop();
    }
    updateMicUI(false);
    removeOverlay();
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_STATUS") {
        sendResponse({ isListening: isListening });
        return true;
    } else if (request.action === "CHUNK_TRANSCRIBED") {
        if (!request.text || request.text.trim() === "") {
            if (logContainer) {
                const logMsg = document.createElement('div');
                logMsg.style.marginBottom = '2px';
                logMsg.style.color = '#f44336';
                logMsg.style.fontSize = '12px';
                logMsg.innerText = `[${new Date().toLocaleTimeString()}] [Debug] Whisper returned empty text (Silence/Echo dropped).`;
                logContainer.appendChild(logMsg);
                if (autoScrollEnabled) logContainer.scrollTop = logContainer.scrollHeight;
            }
            return;
        }

        let newText = request.text.trim();

        // Hard filter known Whisper silent static hallucinations if they are the ONLY words in the chunk
        const sanitized = newText.toLowerCase().replace(/[^a-z\s]/g, '').trim();
        const blocklist = [
            "thank you", "thanks for watching", "laughter", "job interview laughter",
            "hello", "yeah", "subscribe", "subtitles", "transcription by castingwords"
        ];
        if (blocklist.includes(sanitized) || sanitized.includes("castingwords") || sanitized.includes("amaraorg")) {
            if (logContainer) {
                const logMsg = document.createElement('div');
                logMsg.style.marginBottom = '2px';
                logMsg.style.color = '#ff9800';
                logMsg.style.fontSize = '12px';
                logMsg.innerText = `[${new Date().toLocaleTimeString()}] [Debug] Dropped Hallucination block: "${newText}"`;
                logContainer.appendChild(logMsg);
                if (autoScrollEnabled) logContainer.scrollTop = logContainer.scrollHeight;
            }
            return;
        }

        fullTranscript += (fullTranscript ? " " : "") + newText;

        if (transcriptContainer) {
            const msg = document.createElement('div');
            msg.className = 'transcript-msg final';
            msg.innerText = newText;
            transcriptContainer.appendChild(msg);

            if (autoScrollEnabled) {
                transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
            }
        }

        if (logContainer) {
            const logMsg = document.createElement('div');
            logMsg.style.marginBottom = '4px';
            logMsg.innerText = `[${new Date().toLocaleTimeString()}] ${newText}`;
            logContainer.appendChild(logMsg);
            if (autoScrollEnabled) logContainer.scrollTop = logContainer.scrollHeight;
        }

        chrome.runtime.sendMessage({
            action: "PROCESS_TRANSCRIPT",
            transcript: fullTranscript
        });
    } else if (request.action === "TOGGLE_LISTENING") {
        if (isListening) stopListening();
        else startListening();
    } else if (request.action === "START_LISTENING") {
        startListening();
    } else if (request.action === "STOP_LISTENING") {
        stopListening();
    } else if (request.action === "SHOW_AI_RESPONSE") {
        if (!textContainer) return;

        if (request.response === "Thinking...") {
            needsNewBlock = true; // Signals the frontend to stack a fresh UI block for the upcoming stream
            return;
        }

        if (request.response.includes("[NO_ANSWER_NEEDED]")) {
            return; // Abort creating a new block. This drops repeating/spam responses flawlessly!
        }

        if (needsNewBlock || !activeMessageDiv) {
            // Append a new response block separated by a thin line
            activeMessageDiv = document.createElement('div');
            activeMessageDiv.style.marginBottom = "14px";
            activeMessageDiv.style.paddingBottom = "14px";
            activeMessageDiv.style.borderBottom = "1px solid rgba(255, 255, 255, 0.15)";
            textContainer.appendChild(activeMessageDiv);
            needsNewBlock = false;
        }

        activeMessageDiv.innerText = request.response;
        // Auto scroll to always see latest text
        if (autoScrollEnabled) {
            textContainer.scrollTop = textContainer.scrollHeight;
        }
    } else if (request.action === "START_AI_STREAM") {
        if (!textContainer) return;
        
        needsNewBlock = true;
        if (needsNewBlock || !activeMessageDiv) {
            activeMessageDiv = document.createElement('div');
            activeMessageDiv.style.marginBottom = "14px";
            activeMessageDiv.style.paddingBottom = "14px";
            activeMessageDiv.style.borderBottom = "1px solid rgba(255, 255, 255, 0.15)";
            textContainer.appendChild(activeMessageDiv);
            needsNewBlock = false;
        }
        activeMessageDiv.innerText = "";
    } else if (request.action === "STREAM_AI_TOKEN") {
        if (activeMessageDiv && request.token) {
            activeMessageDiv.innerText += request.token;
            // Real-time cleanup to instantly hide system commands if they leak to screen during fast typing
            if (activeMessageDiv.innerText.includes("[NO_ANSWER_NEEDED]")) {
                activeMessageDiv.innerText = activeMessageDiv.innerText.replace("[NO_ANSWER_NEEDED]", "");
            }
            if (autoScrollEnabled) textContainer.scrollTop = textContainer.scrollHeight;
        }
    } else if (request.action === "DELETE_SPAM_BLOCK") {
        // The block turned out to be an invisible system command drop, trash it.
        if (activeMessageDiv) {
            activeMessageDiv.remove();
            activeMessageDiv = null;
        }
        needsNewBlock = true;
    }
});
