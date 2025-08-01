/**
 * Combined YouTube TTS Script with Navigation Handling
 * Filters out unwanted transcript content and provides TTS controls
 */
(async function () {
    'use strict';
    
    // Prevent multiple instances
    if (window.__myInjectedYoutubeScriptHasRun__) return;
    window.__myInjectedYoutubeScriptHasRun__ = true;
    
    let isRunning = false;
    let debounceTimer = null;
    let lastUrl = location.href;
    let runs = 0;
    let currentEventSystem = null;

    /**
     * Enhanced Timed Event System with Smart TTS Timing and DOM Controls
     */
    class TimedEventSystem {
        constructor(options = {}) {
            this.onEvent = options.onEvent || function() {};
            this.debug = options.debug || false;
            this.targetLanguage = options.targetLanguage || null;
            this.translationBufferSize = options.translationBufferSize || 10;
            this.translationEndpoint = options.translationEndpoint || 'https://browser-production-2e20.up.railway.app/translate/batch';

            this.video = null;
            this.events = [];
            this.currentEventIndex = 0;
            this.lastTime = 0;
            this.isActive = false;
            this.timeUpdateHandler = null;
            this.isBatchTranslating = false;
            
            // TTS timing management
            this.currentlySpeaking = false;
            this.speechQueue = [];
            this.speechStartTime = 0;
            this.estimatedSpeechDuration = 0;
            this.minGapBetweenSentences = 0.5;
            this.maxDelayAllowed = 5;
            this.wordsPerMinute = 150;
            
            // User control state
            this.userPaused = false;
            this.controlsContainer = null;
            
            // Video muting state
            this.originalVideoVolume = null;
            this.wasVideoMuted = false;
        }

        /**
         * Creates DOM controls for start/stop functionality
         */
        createControls() {
            // Remove existing controls if any
            const existingControls = document.getElementById('tts-controls');
            if (existingControls) {
                existingControls.remove();
            }

            // Find placement container
            const placementContainer = this.findControlsPlacement();
            if (!placementContainer) {
                this.log('Could not find placement container, controls will not be created');
                return;
            }

            // Create controls container
            this.controlsContainer = document.createElement('div');
            this.controlsContainer.id = 'tts-controls';
            this.controlsContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 15px 0;
                padding: 10px;
                background: rgba(255, 255, 255, 0.95);
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                font-family: Arial, sans-serif;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                position: relative;
                z-index: 1000;
            `;

            // Create start/stop button
            const toggleButton = document.createElement('button');
            toggleButton.id = 'tts-toggle';
            toggleButton.textContent = this.userPaused ? '▶️ Start TTS' : '⏸️ Stop TTS';
            toggleButton.style.cssText = `
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                background: ${this.userPaused ? '#4CAF50' : '#f44336'};
                color: white;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.3s;
                font-weight: 500;
            `;

            toggleButton.addEventListener('click', () => {
                this.toggleTTS();
            });

            // Create compact status indicator
            const statusSpan = document.createElement('span');
            statusSpan.id = 'tts-status';
            statusSpan.style.cssText = `
                font-size: 12px;
                color: #333;
                font-weight: 500;
            `;
            this.updateStatus(statusSpan);

            // Create language indicator
            const langSpan = document.createElement('span');
            langSpan.textContent = `${this.targetLanguage || 'Original'}`;
            langSpan.style.cssText = `
                font-size: 11px;
                color: #666;
                background: rgba(0, 0, 0, 0.08);
                padding: 4px 8px;
                border-radius: 4px;
            `;

            // Assemble controls
            this.controlsContainer.appendChild(toggleButton);
            this.controlsContainer.appendChild(statusSpan);
            this.controlsContainer.appendChild(langSpan);

            // Insert controls - try different placement strategies
            if (placementContainer.id === 'secondary') {
                // Insert at the beginning of sidebar
                placementContainer.insertBefore(this.controlsContainer, placementContainer.firstChild);
            } else {
                // Insert after the container
                placementContainer.parentNode.insertBefore(this.controlsContainer, placementContainer.nextSibling);
            }
        }

        /**
         * Finds the appropriate container to place controls
         */
        findControlsPlacement() {
            // Try different selectors for placement - look for elements that come after the video
            const selectors = [
                '#secondary',              // YouTube sidebar
                '#below',                  // Below video content
                '#meta',                   // Video metadata section
                '#info',                   // Video info section
                '.ytd-watch-flexy',        // Watch page container
            ];

            for (const selector of selectors) {
                const container = document.querySelector(selector);
                if (container) {
                    this.log(`Found placement container using selector: ${selector}`);
                    return container;
                }
            }

            // Fallback: create placement after video
            const video = document.querySelector('video');
            if (video) {
                const videoParent = video.closest('#movie_player') || video.parentElement;
                return videoParent;
            }

            return null;
        }

        /**
         * Toggles TTS on/off
         */
        toggleTTS() {
            this.userPaused = !this.userPaused;
            
            const button = document.getElementById('tts-toggle');
            const statusSpan = document.getElementById('tts-status');
            
            if (this.userPaused) {
                // Stop TTS
                this.stopCurrentSpeech();
                button.textContent = '▶️ Start TTS';
                button.style.background = '#4CAF50';
                this.log('TTS paused by user');
            } else {
                // Resume TTS
                button.textContent = '⏸️ Stop TTS';
                button.style.background = '#f44336';
                this.log('TTS resumed by user');
            }
            
            this.updateStatus(statusSpan);
        }

        /**
         * Updates the status display
         */
        updateStatus(statusElement) {
            if (!statusElement) return;
            
            let status = 'Inactive';
            let color = '#999';
            
            if (this.userPaused) {
                status = '⏸️ Paused';
                color = '#ff9800';
            } else if (this.currentlySpeaking) {
                status = '🔊 Speaking';
                color = '#4CAF50';
            } else if (this.speechQueue.length > 0) {
                status = `⏳ Queued (${this.speechQueue.length})`;
                color = '#2196F3';
            } else if (this.isActive) {
                status = '✅ Ready';
                color = '#4CAF50';
            }
            
            statusElement.textContent = status;
            statusElement.style.color = color;
        }

        /**
         * Mutes the video when TTS starts speaking
         */
        muteVideo() {
            if (!this.video) return;
            
            // Store original state only if we haven't already
            if (this.originalVideoVolume === null) {
                this.originalVideoVolume = this.video.volume;
                this.wasVideoMuted = this.video.muted;
            }
            
            this.video.muted = true;
            this.log('Video muted for TTS');
        }

        /**
         * Unmutes the video when TTS stops
         */
        unmuteVideo() {
            if (!this.video || this.originalVideoVolume === null) return;
            
            // Only unmute if the video wasn't originally muted
            if (!this.wasVideoMuted) {
                this.video.muted = false;
                this.video.volume = this.originalVideoVolume;
                this.log('Video unmuted after TTS');
            }
        }

        /**
         * Resets video muting state
         */
        resetVideoMuteState() {
            this.originalVideoVolume = null;
            this.wasVideoMuted = false;
        }

        /**
         * Filters out unwanted transcript content
         */
        filterTranscriptText(text) {
            if (!text || typeof text !== 'string') {
                return null;
            }

            // Remove empty or whitespace-only text
            const trimmed = text.trim();
            if (!trimmed) {
                return null;
            }

            // Filter out sound effects and music
            const soundEffectPatterns = [
                /^\[.*\]$/i,                    // [MUSIC PLAYING], [APPLAUSE], etc.
                /^\(.*\)$/i,                    // (music), (applause), etc.
                /^.*MUSIC.*$/i,                 // Any line containing MUSIC
                /^.*APPLAUSE.*$/i,              // Any line containing APPLAUSE
                /^.*LAUGHTER.*$/i,              // Any line containing LAUGHTER
                /^.*SOUND.*$/i,                 // Any line containing SOUND
                /^.*AUDIO.*$/i,                 // Any line containing AUDIO
                /^\*.*\*$/i,                    // *sound effect*
            ];

            for (const pattern of soundEffectPatterns) {
                if (pattern.test(trimmed)) {
                    this.log(`Filtered out sound effect: "${trimmed}"`);
                    return null;
                }
            }

            // Remove speaker names (format: "SPEAKER NAME: text" or "Speaker Name: text")
            const speakerPattern = /^([A-Z][A-Z\s]+|[A-Za-z\s]+):\s*/;
            let cleanText = trimmed.replace(speakerPattern, '');
            
            // If removing speaker name left us with empty text, return null
            if (!cleanText.trim()) {
                this.log(`Filtered out speaker-only line: "${trimmed}"`);
                return null;
            }

            // Log speaker removal if it happened
            if (cleanText !== trimmed) {
                this.log(`Removed speaker name: "${trimmed}" -> "${cleanText}"`);
            }

            return cleanText.trim();
        }

        /**
         * Stops current speech and clears queue
         */
        stopCurrentSpeech() {
            if (AndroidTTS && typeof AndroidTTS.stopSpeaking === 'function') {
                AndroidTTS.stopSpeaking();
            }
            this.currentlySpeaking = false;
            this.speechQueue = [];
            
            // Update status
            const statusSpan = document.getElementById('tts-status');
            this.updateStatus(statusSpan);
        }

        /**
         * Cleanup method for when navigating away
         */
        cleanup() {
            this.log('Cleaning up TimedEventSystem...');
            this.stop();
            this.stopCurrentSpeech();
            
            // Only unmute video when cleaning up (navigating away)
            this.unmuteVideo();
            this.resetVideoMuteState();
            
            // Remove controls
            if (this.controlsContainer && this.controlsContainer.parentNode) {
                this.controlsContainer.parentNode.removeChild(this.controlsContainer);
                this.controlsContainer = null;
            }
        }

        async init() {
            this.log('Initializing...');
            
            // Wait for video element to be available
            let attempts = 0;
            const maxAttempts = 20;
            
            while (!this.video && attempts < maxAttempts) {
                this.video = document.querySelector('video');
                if (!this.video) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    attempts++;
                }
            }

            if (!this.video) {
                this.handleError('No video element found on the page after waiting.');
                return;
            }
            
            this.log('Video element found.');

            // Create controls immediately
            this.createControls();

            if (window.location.hostname.includes('youtube.com')) {
                try {
                    const transcript = await this.extractYouTubeTranscript();
                    if (transcript && transcript.length > 0) {
                        this.loadTranscript(transcript);
                    } else {
                        this.handleError('Transcript extracted but it was empty.');
                    }
                } catch (error) {
                    this.handleError('Failed to auto-extract YouTube transcript.', error);
                }
            } else {
                this.log('Not on a YouTube page. Manual transcript loading is required.');
            }
        }

        async extractYouTubeTranscript() {
            const formatTime = (seconds) => {
                const totalSeconds = Math.floor(parseFloat(seconds));
                const mins = Math.floor(totalSeconds / 60);
                const secs = totalSeconds % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            };

            // Extract video ID from current URL
            const urlParams = new URLSearchParams(window.location.search);
            let videoId = urlParams.get('v');
            
            if (!videoId) {
                // Try to extract from different YouTube URL formats
                const url = window.location.href;
                const shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
                const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
                
                if (shortUrlMatch) {
                    videoId = shortUrlMatch[1];
                } else if (embedMatch) {
                    videoId = embedMatch[1];
                }
            }

            if (!videoId) {
                throw new Error('Could not extract video ID from URL');
            }

            this.log(`Extracting transcript for video ID: ${videoId}`);

            const url = `https://youtube-captions.p.rapidapi.com/transcript?videoId=${videoId}`;
            const options = {
                method: "GET",
                headers: {
                    "x-rapidapi-key": "7e16663340mshbfb2c833d8dcaffp1f960fjsnc96a63bc6c4c",
                    "x-rapidapi-host": "youtube-captions.p.rapidapi.com",
                },
            };

            try {
                const response = await fetch(url, options);
                const transcript = await response.json();
                console.log("🚀 ~ TimedEventSystem ~ extractYouTubeTranscript ~ transcript:", transcript);
                return transcript
                    .filter((item) => item.text)
                    .map((item) => ({
                        time: formatTime(item.start),
                        dur: parseFloat(item.dur),
                        text: item.text,
                    }));
            } catch (error) {
                console.error(error);
                throw error;
            }
        }

        estimateSpeechDuration(text) {
            const wordCount = text.split(/\s+/).length;
            const estimatedSeconds = (wordCount / this.wordsPerMinute) * 60;
            return Math.max(estimatedSeconds, 1);
        }

        speakWithSmartTiming(text, originalTime) {
            if (!AndroidTTS || typeof AndroidTTS.speak !== 'function') {
                return;
            }

            this.currentlySpeaking = true;
            this.speechStartTime = this.video.currentTime;
            this.estimatedSpeechDuration = this.estimateSpeechDuration(text);
            
            // Mute video when TTS starts
            this.muteVideo();
            
            this.log(`Speaking: "${text}" (estimated duration: ${this.estimatedSpeechDuration.toFixed(1)}s)`);

            // Update status
            const statusDiv = document.getElementById('tts-status');
            this.updateStatus(statusDiv);

            if (typeof AndroidTTS.speakWithCallback === 'function') {
                const callbackName = `speechComplete_${Date.now()}`;
                window[callbackName] = () => {
                    this.onSpeechComplete();
                    delete window[callbackName];
                };
                AndroidTTS.speakWithCallback(text, callbackName);
            } else {
                AndroidTTS.speak(text);
                setTimeout(() => {
                    this.onSpeechComplete();
                }, this.estimatedSpeechDuration * 1000);
            }
        }

        onSpeechComplete() {
            this.currentlySpeaking = false;
            this.log('Speech completed');
            
            // Remove automatic video unmuting - keep video muted during TTS session
            // if (this.speechQueue.length === 0 && !this.userPaused) {
            //     this.unmuteVideo();
            // }
            
            // Update status
            const statusSpan = document.getElementById('tts-status');
            this.updateStatus(statusSpan);
            
            this.processQueuedSpeech();
        }

        processQueuedSpeech() {
            if (this.speechQueue.length > 0 && !this.currentlySpeaking && !this.userPaused) {
                const nextSpeech = this.speechQueue.shift();
                this.speakWithSmartTiming(nextSpeech.text, nextSpeech.originalTime);
            }
        }

        queueOrSpeak(text, originalTime) {
            // Don't proceed if user has paused TTS
            if (this.userPaused) {
                return;
            }

            // Filter the text first
            const filteredText = this.filterTranscriptText(text);
            if (!filteredText) {
                return; // Skip this text entirely
            }

            if (this.currentlySpeaking) {
                const timeSinceLastSpeech = this.video.currentTime - this.speechStartTime;
                const remainingEstimatedTime = Math.max(0, this.estimatedSpeechDuration - timeSinceLastSpeech);
                const delayUntilOriginalTime = Math.max(0, originalTime - this.video.currentTime);
                
                if (delayUntilOriginalTime > this.maxDelayAllowed || remainingEstimatedTime > delayUntilOriginalTime + 2) {
                    this.log('Interrupting current speech for new sentence');
                    if (AndroidTTS && typeof AndroidTTS.stopSpeaking === 'function') {
                        AndroidTTS.stopSpeaking();
                    }
                    this.currentlySpeaking = false;
                    this.speechQueue = [];
                    this.speakWithSmartTiming(filteredText, originalTime);
                } else {
                    this.speechQueue.push({ text: filteredText, originalTime });
                    this.log(`Queued speech: "${filteredText}" (queue length: ${this.speechQueue.length})`);
                    
                    // Update status
                    const statusSpan = document.getElementById('tts-status');
                    this.updateStatus(statusSpan);
                }
            } else {
                this.speakWithSmartTiming(filteredText, originalTime);
            }
        }

        async _translateBatch(eventsToTranslate) {
            if (eventsToTranslate.length === 0) {
                return;
            }

            const texts = eventsToTranslate.map(event => event.originalText);
            this.log(`Sending batch of ${texts.length} texts for translation.`);

            try {
                const response = await fetch(this.translationEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ texts, targetLang: this.targetLanguage })
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                if (data.success && data.results) {
                    data.results.forEach((result, i) => {
                        const event = eventsToTranslate[i];
                        if (event && result.translated) {
                            event.text = result.translated;
                            event.isTranslated = true;
                        }
                    });
                    this.log('Batch translation successful.');
                } else {
                    throw new Error('API response did not indicate success or results were missing.');
                }
            } catch (err) {
                this.handleError('Batch translation request failed:', err);
            }
        }

        loadTranscript(transcript) {
            if (!Array.isArray(transcript)) {
                this.handleError('Transcript data must be an array.');
                return;
            }

            // Filter out unwanted content during loading
            this.events = transcript
                .map((item, index) => ({
                    id: `event_${index}`,
                    time: this.parseTimeToSeconds(item.time),
                    text: item.text,
                    originalText: item.text,
                    isTranslated: false,
                    fired: false,
                    duration: item.dur || 3,
                }))
                .filter(event => this.filterTranscriptText(event.text) !== null) // Only keep valid events
                .sort((a, b) => a.time - b.time);

            for (let i = 0; i < this.events.length - 1; i++) {
                const current = this.events[i];
                const next = this.events[i + 1];
                current.gapToNext = next.time - current.time;
            }

            this.currentEventIndex = 0;
            this.log(`Loaded ${this.events.length} valid events (filtered from ${transcript.length} total). Starting system.`);

            if (this.video) {
                this.start();
            }
        }

        parseTimeToSeconds(timeString) {
            const parts = timeString.split(':').map(part => parseInt(part, 10));
            let seconds = 0;
            if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
            return isNaN(seconds) ? 0 : seconds;
        }

        start() {
            if (!this.video || this.isActive || this.events.length === 0) return;

            this.timeUpdateHandler = () => {
                const currentTime = this.video.currentTime;
                if (currentTime < this.lastTime - 1.0) this.resetToTime(currentTime);
                this.lastTime = currentTime;
                this.processEvents(currentTime);
            };

            this.video.addEventListener('timeupdate', this.timeUpdateHandler);
            this.video.addEventListener('seeked', () => this.resetToTime(this.video.currentTime));
            this.video.addEventListener('ended', () => this.stop());

            this.isActive = true;
            this.log('Timed event system started.');
        }

        stop() {
            if (this.timeUpdateHandler && this.video) {
                this.video.removeEventListener('timeupdate', this.timeUpdateHandler);
            }
            this.isActive = false;

            this.stopCurrentSpeech();
            this.log('Timed event system stopped.');
        }

        async translateUpcomingEvents() {
            if (!this.targetLanguage || this.isBatchTranslating) {
                return;
            }

            const eventsToTranslate = this.events
                .slice(this.currentEventIndex, this.currentEventIndex + this.translationBufferSize)
                .filter(event => event && !event.isTranslated);

            if (eventsToTranslate.length > 0) {
                this.isBatchTranslating = true;
                await this._translateBatch(eventsToTranslate);
                this.isBatchTranslating = false;
            }
        }

        processEvents(currentTime) {
            this.translateUpcomingEvents();

            while (this.currentEventIndex < this.events.length) {
                const event = this.events[this.currentEventIndex];

                if (currentTime >= event.time && !event.fired) {
                    try {
                        this.queueOrSpeak(event.text, event.time);
                        this.onEvent(event);
                    } catch (error) {
                        this.handleError('Error in onEvent callback', error);
                    }
                    event.fired = true;
                    this.currentEventIndex++;
                } else if (currentTime < event.time) {
                    this.optimizeUpcomingTiming(currentTime);
                    break;
                } else {
                    this.currentEventIndex++;
                }
            }
        }

        optimizeUpcomingTiming(currentTime) {
            if (!this.currentlySpeaking || this.currentEventIndex >= this.events.length) {
                return;
            }

            const nextEvent = this.events[this.currentEventIndex];
            const timeUntilNext = nextEvent.time - currentTime;
            const timeSinceLastSpeech = currentTime - this.speechStartTime;
            const remainingEstimatedTime = Math.max(0, this.estimatedSpeechDuration - timeSinceLastSpeech);

            if (remainingEstimatedTime > timeUntilNext + this.minGapBetweenSentences) {
                this.log(`Potential overlap detected. Remaining: ${remainingEstimatedTime.toFixed(1)}s, Time until next: ${timeUntilNext.toFixed(1)}s`);
                
                if (AndroidTTS && typeof AndroidTTS.setSpeechRate === 'function') {
                    const speedMultiplier = Math.min(1.5, remainingEstimatedTime / (timeUntilNext + this.minGapBetweenSentences));
                    if (speedMultiplier > 1.1) {
                        AndroidTTS.setSpeechRate(speedMultiplier);
                        this.log(`Increased speech rate to ${speedMultiplier.toFixed(2)}x`);
                    }
                }
            }
        }

        resetToTime(time) {
            this.stopCurrentSpeech();

            if (AndroidTTS && typeof AndroidTTS.setSpeechRate === 'function') {
                AndroidTTS.setSpeechRate(1.0);
            }

            this.events.forEach(event => {
                if (event.time >= time) event.fired = false;
            });

            this.currentEventIndex = this.events.findIndex(event => event.time >= time);
            if (this.currentEventIndex === -1) this.currentEventIndex = this.events.length;

            this.log(`Reset to time: ${time.toFixed(2)}s, next event index: ${this.currentEventIndex}`);
            this.translateUpcomingEvents();
        }

        log(message, ...args) {
            if (this.debug) console.log(`[TimedEventSystem] ${message}`, ...args);
        }

        handleError(message, details = null) {
            console.error('TimedEventSystem Error:', message, details || '');
        }
    }

    // Main script logic
    async function runMainScript() {
        runs++;
        
        // Prevent multiple simultaneous executions
        if (isRunning || runs === 1) {
            console.log('Script already running, skipping...');
            return;
        }
        
        isRunning = true;
        
        try {
            console.log('Script running for:', location.href);
            
            // Clean up any existing event system
            if (currentEventSystem) {
                currentEventSystem.cleanup();
                currentEventSystem = null;
            }
            
            // Only initialize TTS on YouTube watch pages
            if (window.location.hostname.includes('youtube.com') && 
                window.location.pathname === '/watch') {
                
                if (AndroidTTS) {
                    console.log("AndroidTTS interface found. Initializing system with controls and filtering.");
                    
                    currentEventSystem = new TimedEventSystem({
                        debug: true,
                        targetLanguage: 'ar',
                        onEvent: (event) => {
                            console.log(`EVENT FIRED at ${event.time.toFixed(2)}s: "${event.text}"`);
                        }
                    });
                    
                    await currentEventSystem.init();
                } else {
                    console.error("AndroidTTS interface not found. The script will not run.");
                }
            } else {
                console.log("Not on a YouTube watch page, TTS system not initialized.");
            }
            
        } catch (error) {
            console.error('Error in runMainScript:', error);
        } finally {
            isRunning = false;
        }
    }

    // Debounced version to prevent rapid-fire executions
    function debouncedRunMainScript() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            runMainScript();
        }, 150);
    }

    // Run initially
    await runMainScript();

    // MutationObserver for DOM changes (URL changes)
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            console.log('URL changed from', lastUrl, 'to', location.href);
            lastUrl = location.href;
            debouncedRunMainScript();
        }
    });

    observer.observe(document, {
        subtree: true,
        childList: true
    });

    // History API override
    ['pushState', 'replaceState'].forEach(method => {
        const original = history[method];
        history[method] = function() {
            const result = original.apply(this, arguments);
            console.log('History API called:', method);
            debouncedRunMainScript();
            return result;
        };
    });

    // Handle back/forward buttons
    window.addEventListener('popstate', (event) => {
        console.log('Popstate event triggered');
        debouncedRunMainScript();
    });

})();