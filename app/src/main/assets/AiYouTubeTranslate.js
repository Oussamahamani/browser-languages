(async function () {
    'use strict';
    if (window.__myInjectedYoutubeScriptHasRun__) return;
    window.__myInjectedYoutubeScriptHasRun__ = true;
    console.log("loaded from js youtube")

/**
 * Enhanced Timed Event System with Smart TTS Timing Adjustment
 * This version buffers upcoming sentences and adjusts timing to prevent cutoffs
 */
class TimedEventSystem {
    constructor(options = {}) {
        this.onEvent = options.onEvent || function() {};
        this.debug = options.debug || false;
        this.targetLanguage = options.targetLanguage || null;
        this.translationBufferSize = options.translationBufferSize || 10;
        this.translationEndpoint = options.translationEndpoint || 'https://10.0.2.2:3001/translate/batch';

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
        this.minGapBetweenSentences = 0.5; // minimum seconds between sentences
        this.maxDelayAllowed = 5; // max seconds we can delay a sentence
        this.wordsPerMinute = 150; // average speaking rate for estimation

        this.init();
    }

    async init() {
        this.log('Initializing...');
        this.video = document.querySelector('video');

        if (!this.video) {
            this.handleError('No video element found on the page.');
            return;
        }
        this.log('Video element found.');

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
function extractYouTubeVideoIDFromCurrentPage() {
  const url = window.location.href;
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

        const url = "https://youtube-captions.p.rapidapi.com/transcript?videoId=qcjrduz_YS8";
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
            console.log("🚀 ~ TimedEventSystem ~ extractYouTubeTranscript ~ transcript:", transcript)
            return transcript
                .filter((item) => item.text)
                .map((item) => ({
                    time: formatTime(item.start),
                    dur: parseFloat(item.dur),
                    text: item.text,
                }));
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * Estimates speech duration based on text length and speaking rate
     */
    estimateSpeechDuration(text) {
        const wordCount = text.split(/\s+/).length;
        const estimatedSeconds = (wordCount / this.wordsPerMinute) * 60;
        return Math.max(estimatedSeconds, 1); // minimum 1 second
    }

    /**
     * Enhanced TTS speak function with completion callback
     */
    speakWithSmartTiming(text, originalTime) {
        if (!AndroidTTS || typeof AndroidTTS.speak !== 'function') {
            return;
        }

        this.currentlySpeaking = true;
        this.speechStartTime = this.video.currentTime;
        this.estimatedSpeechDuration = this.estimateSpeechDuration(text);

        this.log(`Speaking: "${text}" (estimated duration: ${this.estimatedSpeechDuration.toFixed(1)}s)`);

        // Check if AndroidTTS supports callback
        if (typeof AndroidTTS.speakWithCallback === 'function') {
            // Create a unique callback name
            const callbackName = `speechComplete_${Date.now()}`;

            // Set up the callback
            window[callbackName] = () => {
                this.onSpeechComplete();
                delete window[callbackName]; // cleanup
            };

            AndroidTTS.speakWithCallback(text, callbackName);
        } else {
            // Fallback: use regular speak and estimate completion time
            AndroidTTS.speak(text);
            setTimeout(() => {
                this.onSpeechComplete();
            }, this.estimatedSpeechDuration * 1000);
        }
    }

    /**
     * Called when TTS completes speaking
     */
    onSpeechComplete() {
        this.currentlySpeaking = false;
        this.log('Speech completed');

        // Process any queued speech
        this.processQueuedSpeech();
    }

    /**
     * Process queued speech items
     */
    processQueuedSpeech() {
        if (this.speechQueue.length > 0 && !this.currentlySpeaking) {
            const nextSpeech = this.speechQueue.shift();
            this.speakWithSmartTiming(nextSpeech.text, nextSpeech.originalTime);
        }
    }

    /**
     * Queue speech or speak immediately based on current state
     */
    queueOrSpeak(text, originalTime) {
        if (this.currentlySpeaking) {
            // Check if we should interrupt current speech
            const timeSinceLastSpeech = this.video.currentTime - this.speechStartTime;
            const remainingEstimatedTime = Math.max(0, this.estimatedSpeechDuration - timeSinceLastSpeech);
            const delayUntilOriginalTime = Math.max(0, originalTime - this.video.currentTime);

            // If the delay would be too long, interrupt current speech
            if (delayUntilOriginalTime > this.maxDelayAllowed || remainingEstimatedTime > delayUntilOriginalTime + 2) {
                this.log('Interrupting current speech for new sentence');
                if (AndroidTTS && typeof AndroidTTS.stopSpeaking === 'function') {
                    AndroidTTS.stopSpeaking();
                }
                this.currentlySpeaking = false;
                this.speechQueue = []; // clear queue
                this.speakWithSmartTiming(text, originalTime);
            } else {
                // Queue the speech
                this.speechQueue.push({ text, originalTime });
                this.log(`Queued speech: "${text}" (queue length: ${this.speechQueue.length})`);
            }
        } else {
            // Speak immediately
            this.speakWithSmartTiming(text, originalTime);
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

        this.events = transcript.map((item, index) => ({
            id: `event_${index}`,
            time: this.parseTimeToSeconds(item.time),
            text: item.text,
            originalText: item.text,
            isTranslated: false,
            fired: false,
            duration: item.dur || 3, // use provided duration or default to 3 seconds
        })).sort((a, b) => a.time - b.time);

        // Calculate gaps between sentences for better timing
        for (let i = 0; i < this.events.length - 1; i++) {
            const current = this.events[i];
            const next = this.events[i + 1];
            current.gapToNext = next.time - current.time;
        }

        this.currentEventIndex = 0;
        this.log(`Loaded ${this.events.length} events. Starting system.`);

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

        // Stop TTS and clear queue
        if (AndroidTTS && typeof AndroidTTS.stopSpeaking === 'function') {
            AndroidTTS.stopSpeaking();
        }
        this.currentlySpeaking = false;
        this.speechQueue = [];

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

    /**
     * Enhanced processEvents with smart timing
     */
    processEvents(currentTime) {
        this.translateUpcomingEvents();

        while (this.currentEventIndex < this.events.length) {
            const event = this.events[this.currentEventIndex];

            if (currentTime >= event.time && !event.fired) {
                try {
                    // Use the enhanced speech system instead of direct onEvent
                    this.queueOrSpeak(event.text, event.time);

                    // Still call the original onEvent for any other processing
                    this.onEvent(event);
                } catch (error) {
                    this.handleError('Error in onEvent callback', error);
                }
                event.fired = true;
                this.currentEventIndex++;
            } else if (currentTime < event.time) {
                // Look ahead to see if we need to adjust timing
                this.optimizeUpcomingTiming(currentTime);
                break;
            } else {
                this.currentEventIndex++;
            }
        }
    }

    /**
     * Look ahead and optimize timing for upcoming events
     */
    optimizeUpcomingTiming(currentTime) {
        if (!this.currentlySpeaking || this.currentEventIndex >= this.events.length) {
            return;
        }

        const nextEvent = this.events[this.currentEventIndex];
        const timeUntilNext = nextEvent.time - currentTime;
        const timeSinceLastSpeech = currentTime - this.speechStartTime;
        const remainingEstimatedTime = Math.max(0, this.estimatedSpeechDuration - timeSinceLastSpeech);

        // If current speech will likely overlap with next event
        if (remainingEstimatedTime > timeUntilNext + this.minGapBetweenSentences) {
            this.log(`Potential overlap detected. Remaining: ${remainingEstimatedTime.toFixed(1)}s, Time until next: ${timeUntilNext.toFixed(1)}s`);

            // Consider speeding up speech if possible
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
        // Stop current speech and clear queue
        if (AndroidTTS && typeof AndroidTTS.stopSpeaking === 'function') {
            AndroidTTS.stopSpeaking();
        }
        this.currentlySpeaking = false;
        this.speechQueue = [];

        // Reset speech rate to normal
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

// Enhanced usage with smart timing
if (AndroidTTS) {
    console.log("AndroidTTS interface found. Initializing system with smart timing.");

    const eventSystem = new TimedEventSystem({
        debug: true,
        targetLanguage: 'ar',
        onEvent: (event) => {
            // This is now primarily for logging, as speech is handled by the smart timing system
            console.log(`EVENT FIRED at ${event.time.toFixed(2)}s: "${event.text}"`);
        }
    });

} else {
    console.error("AndroidTTS interface not found. The script will not run.");
}

})()