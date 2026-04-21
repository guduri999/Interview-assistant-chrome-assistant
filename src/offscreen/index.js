let audioContext = null;
let captureStream = null;
let mediaRecorder = null;
let chunksBuffer = [];
let vadIntervalId = null;
let silenceTimeoutId = null;
let activeTabId = null;

async function stopEngine() {
    if (vadIntervalId) {
        clearInterval(vadIntervalId);
        vadIntervalId = null;
    }

    if (silenceTimeoutId) {
        clearTimeout(silenceTimeoutId);
        silenceTimeoutId = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    if (captureStream) {
        captureStream.getTracks().forEach((track) => track.stop());
        captureStream = null;
    }

    if (audioContext) {
        await audioContext.close().catch(() => {});
        audioContext = null;
    }

    mediaRecorder = null;
    chunksBuffer = [];
    activeTabId = null;
}

async function startEngine(streamId, tabId) {
    await stopEngine();

    captureStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId
            }
        },
        video: false
    });

    activeTabId = tabId;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextCtor();

    const source = audioContext.createMediaStreamSource(captureStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    source.connect(analyser);
    source.connect(audioContext.destination);

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

    mediaRecorder = new MediaRecorder(
        captureStream,
        preferredMimeType ? { mimeType: preferredMimeType } : undefined
    );

    mediaRecorder.ondataavailable = (event) => {
        chunksBuffer.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(chunksBuffer, { type: 'audio/webm' });
        chunksBuffer = [];

        if (!blob.size || !activeTabId) return;

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            chrome.runtime.sendMessage({
                action: 'TRANSCRIBE_CHUNK',
                audioData: reader.result.split(',')[1],
                tabId: activeTabId
            });
        };
    };

    const pcm = new Float32Array(analyser.fftSize);
    let volumeSpikeCount = 0;
    let isSustainedSpeaking = false;
    let phraseStart = 0;

    vadIntervalId = setInterval(() => {
        analyser.getFloatTimeDomainData(pcm);
        let sumSq = 0;
        for (const value of pcm) sumSq += value * value;
        const rms = Math.sqrt(sumSq / pcm.length);

        if (rms > 0.008) {
            volumeSpikeCount++;

            if (volumeSpikeCount > 2 && !isSustainedSpeaking) {
                isSustainedSpeaking = true;
                phraseStart = Date.now();
                chunksBuffer = [];

                if (mediaRecorder.state === 'inactive') {
                    mediaRecorder.start();
                }
            }

            if (silenceTimeoutId) {
                clearTimeout(silenceTimeoutId);
                silenceTimeoutId = null;
            }

            if (isSustainedSpeaking && Date.now() - phraseStart > 7000) {
                isSustainedSpeaking = false;
                volumeSpikeCount = 0;
                if (mediaRecorder.state === 'recording') mediaRecorder.stop();
            }
        } else if (isSustainedSpeaking) {
            volumeSpikeCount = 0;
            if (!silenceTimeoutId) {
                silenceTimeoutId = setTimeout(() => {
                    silenceTimeoutId = null;
                    isSustainedSpeaking = false;
                    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
                }, 1500);
            }
        } else {
            volumeSpikeCount = Math.max(0, volumeSpikeCount - 1);
        }
    }, 50);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'OFFSCREEN_START_TAB_ENGINE') {
        startEngine(request.streamId, request.tabId)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (request.action === 'OFFSCREEN_STOP_AUDIO') {
        stopEngine()
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }
});
