document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleBtn');
    const statusDiv = document.getElementById('status');
    let isRunning = false;

    function updateUI() {
        if (isRunning) {
            toggleBtn.textContent = "Stop Listening";
            toggleBtn.className = "stop";
            statusDiv.textContent = "Status: Listening and transcribing...";
        } else {
            toggleBtn.textContent = "Start Listening";
            toggleBtn.className = "";
            statusDiv.textContent = "Status: Idle";
        }
    }

    // Load initial state specifically from the active tab's content script
    // This prevents out-of-sync phantom states if the page was refreshed!
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "GET_STATUS" }, (response) => {
                if (chrome.runtime.lastError) {
                    // Content script not loaded yet (or restricted page)
                    isRunning = false;
                } else if (response && response.isListening !== undefined) {
                    isRunning = response.isListening;
                } else {
                    isRunning = false;
                }
                updateUI();
            });
        }
    });

    toggleBtn.addEventListener('click', () => {
        isRunning = !isRunning;
        updateUI();

        // Send action down to the content script directly
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const action = isRunning ? "START_LISTENING" : "STOP_LISTENING";
                chrome.tabs.sendMessage(tabs[0].id, { action: action });
            }
        });
    });

    // API KEY LOGIC
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveKeyBtn = document.getElementById('saveKeyBtn');

    chrome.storage.local.get(['apiKey'], (result) => {
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }
    });

    saveKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        chrome.storage.local.set({ apiKey: key }, () => {
            const originalText = saveKeyBtn.textContent;
            saveKeyBtn.textContent = "Saved!";
            saveKeyBtn.style.backgroundColor = "#4caf50";
            setTimeout(() => {
                saveKeyBtn.textContent = originalText;
                saveKeyBtn.style.backgroundColor = "#2196F3";
            }, 1500);
        });
    });
});
