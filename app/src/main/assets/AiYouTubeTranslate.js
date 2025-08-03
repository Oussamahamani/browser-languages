/**
 * Combined YouTube TTS Script with Navigation Handling
 * Filters out unwanted transcript content and provides TTS controls
 */
(async function () {
  "use strict";

  // Prevent multiple instances
  if (window.__myInjectedYoutubeScriptHasRun__) return;
  window.__myInjectedYoutubeScriptHasRun__ = true;
  // SVGs for the icons
return
  let isRunning = false;
  let debounceTimer = null;
  let lastUrl = location.href;
  let runs = 0;
  let currentEventSystem = null;

  /**
   * Enhanced Timed Event System with Smart TTS Timing and Simple SVG Controls
   */
  class TimedEventSystem {
    constructor(options = {}) {
      this.onEvent = options.onEvent || function () {};
      this.debug = options.debug || false;
      this.targetLanguage = options.targetLanguage || null;
      this.translationBufferSize = options.translationBufferSize || 10;
      this.translationEndpoint =
        options.translationEndpoint ||
        "https://browser-production-2e20.up.railway.app/translate/batch";

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
      this.controlButton = null;

      // Video muting state
      this.originalVideoVolume = null;
      this.wasVideoMuted = false;
    }

    /**
     * Creates simple SVG button controls
     */
    createControls() {
      // Remove existing button if any
      if (this.controlButton && this.controlButton.parentNode) {
        this.controlButton.parentNode.removeChild(this.controlButton);
      }

      // SVGs for the icons
      const defaultSVG = `
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M824.94-305Q802-305 786-321.04q-16-16.04-16-38.96v-100q0-22.92 16.06-38.96t39-16.04Q848-515 864-498.96q16 16.04 16 38.96v100q0 22.92-16.06 38.96t-39 16.04ZM810-160v-66q-51-8-85-43.5T690-355h30q2 42 32.5 71t72.5 29q42 0 72.5-29t32.5-71h30q-1 50-35 85.5t-85 43.96V-160h-30ZM399-500q-67 0-108.5-41.5T249-650q0-67 41.5-108.5T399-800q7 0 19 1.5t22 3.5q-26 31-38.5 66.5T389-650q0 43 12.5 78.5T440-505q-11.05 2.78-22.52 3.89Q406-500 399-500ZM40-160v-94q0-37 17.5-63t51.5-45q39-22 98-37.5T340-423q-65 31-90.5 75T224-254v94H40Zm559-340q-63 0-106.5-43.5T449-650q0-63 43.5-106.5T599-800q63 0 106.5 43.5T749-650q0 63-43.5 106.5T599-500Zm0-60q38 0 64-26.44T689-650q0-38-26-64t-63.5-26q-37.5 0-64 26T509-650.5q0 37.5 26.44 64T599-560ZM284-160v-94q0-35 18.5-63.5T353-360q47-21 108.5-40.5T599-420q5 0 13.5.5t14.5.5q-6 15-10 29.5t-6 29.5h-12q-72 0-124 16.5T377-306q-16 8-24.5 21.5T344-254v34h304q11 16 26 31.5t35 28.5H284Zm315-490Zm0 430Z"/></svg>
            `;

      const clickedSVG = `
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M825-305q-23 0-39-16t-16-39v-100q0-23 16-39t39-16q23 0 39 16t16 39v100q0 23-16 39t-39 16Zm-15 145v-66q-51-8-85-43.5T690-355h30q2 42 32.5 71t72.5 29q42 0 72.5-29t32.5-71h30q-1 50-35 85.5T840-226v66h-30ZM399-500q-67 0-108.5-41.5T249-650q0-67 41.5-108.5T399-800q7 0 19 1.5t22 3.5q-26 31-38.5 66.5T389-650q0 43 12.5 78.5T440-505q-11 3-22.5 4t-18.5 1ZM40-160v-94q0-37 17.5-63t51.5-45q39-22 98-37.5T340-423q-65 31-90.5 75T224-254v94H40Zm559-340q-63 0-106.5-43.5T449-650q0-63 43.5-106.5T599-800q63 0 106.5 43.5T749-650q0 63-43.5 106.5T599-500ZM284-160v-94q0-35 18.5-63.5T353-360q47-21 108.5-40.5T599-420q5 0 13.5.5t14.5.5q-29 72-5.5 144.5T709-160H284Z"/></svg>
            `;

      // Create the button and SVG container
      this.controlButton = document.createElement("button");
      const svgContainer = document.createElement("span");
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        const policy = window.trustedTypes.createPolicy("default", {
          createHTML: (input) => input,
        });
        svgContainer.innerHTML = policy.createHTML(defaultSVG);
      } else {
        svgContainer.innerHTML = defaultSVG;
      }


      // Add hover effect
      this.controlButton.addEventListener("mouseenter", () => {
        this.controlButton.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
      });

      this.controlButton.addEventListener("mouseleave", () => {
        this.controlButton.style.backgroundColor = "transparent";
      });

      this.controlButton.appendChild(svgContainer);

      // Click handler
      this.controlButton.addEventListener("click", () => {
        this.toggleTTS();
        svgContainer.innerHTML = this.userPaused ? defaultSVG : clickedSVG;
      });

      this.injectButton();
    //   document.querySelector(".player-controls-background").click()

    }

    /**
     * Injects the button into the YouTube player controls
     */
    injectButton() {
  

      const tryInject = () => {
  
        const interval = setInterval(() => {
    const container = document.querySelector(".player-controls-top");
    console.log("looking for container", container)
    if (container) {
        clearInterval(interval);
            console.log("looking for container:found", container)

        container.prepend(this.controlButton);
    }
}, 400);
      };

      // Try immediately
      if (tryInject()) return;

   
    }

    /**
     * Toggles TTS on/off
     */
    toggleTTS() {
      this.userPaused = !this.userPaused;

      if (this.userPaused) {
        // Stop TTS
        this.stopCurrentSpeech();
        this.log("TTS paused by user");
        // Unmute video when TTS is paused
        this.unmuteVideo();
      } else {
        // Resume TTS
        this.muteVideo()
        this.log("TTS resumed by user");
      }
    }

    /**
     * Mutes the video when TTS starts speaking
     */
    muteVideo() {
      if (!this.video) return;

    this.video.volume = 0

    }

    /**
     * Unmutes the video when TTS stops
     */
    unmuteVideo() {
      if (!this.video || this.originalVideoVolume === null) return;

      // Only unmute if the video wasn't originally muted
     this.video.volume = 1

      
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
      if (!text || typeof text !== "string") {
        return null;
      }

      // Remove empty or whitespace-only text
      const trimmed = text.trim();
      if (!trimmed) {
        return null;
      }

      // Filter out sound effects and music
      const soundEffectPatterns = [
        /^\[.*\]$/i, // [MUSIC PLAYING], [APPLAUSE], etc.
        /^\(.*\)$/i, // (music), (applause), etc.
        /^.*MUSIC.*$/i, // Any line containing MUSIC
        /^.*APPLAUSE.*$/i, // Any line containing APPLAUSE
        /^.*LAUGHTER.*$/i, // Any line containing LAUGHTER
        /^.*SOUND.*$/i, // Any line containing SOUND
        /^.*AUDIO.*$/i, // Any line containing AUDIO
        /^\*.*\*$/i, // *sound effect*
      ];

      for (const pattern of soundEffectPatterns) {
        if (pattern.test(trimmed)) {
          this.log(`Filtered out sound effect: "${trimmed}"`);
          return null;
        }
      }

      // Remove speaker names (format: "SPEAKER NAME: text" or "Speaker Name: text")
    // Match speaker names in formats like "JOHN:", "John Doe:", or "[john]"
    const speakerPattern = /^([A-Z][A-Z\s]+|[A-Za-z\s]+):\s*|\[[^\]]+\]\s*/i;
      let cleanText = trimmed.replace(speakerPattern, "");

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
      if (AndroidTTS && typeof AndroidTTS.stopSpeaking === "function") {
        AndroidTTS.stopSpeaking();
      }
      this.currentlySpeaking = false;
      this.speechQueue = [];
    }

    /**
     * Cleanup method for when navigating away
     */
    cleanup() {
      this.log("Cleaning up TimedEventSystem...");
      this.stop();
      this.stopCurrentSpeech();

      // Only unmute video when cleaning up (navigating away)
      this.unmuteVideo();
      this.resetVideoMuteState();

      // Remove button
      if (this.controlButton && this.controlButton.parentNode) {
        this.controlButton.parentNode.removeChild(this.controlButton);
        this.controlButton = null;
      }
    }

    async init() {
      this.log("Initializing...");

      // Wait for video element to be available
      let attempts = 0;
      const maxAttempts = 20;

      while (!this.video && attempts < maxAttempts) {
        this.video = document.querySelector("video");
        if (!this.video) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        }
      }

      if (!this.video) {
        this.handleError("No video element found on the page after waiting.");
        return;
      }

      this.log("Video element found.");

      document.querySelector(".ytp-unmute")?.remove()
      this.muteVideo()
      // Create controls immediately
      this.createControls();
      
      if (window.location.hostname.includes("youtube.com")) {
        try {
          const transcript = await this.extractYouTubeTranscript();
          if (transcript && transcript.length > 0) {
            this.loadTranscript(transcript);
            this.toggleTTS(); // stop TTS automatically
          } else {
            this.handleError("Transcript extracted but it was empty.");
          }
        } catch (error) {
          this.handleError("Failed to auto-extract YouTube transcript.", error);
        }
      } else {
        this.log(
          "Not on a YouTube page. Manual transcript loading is required."
        );
      }
    }

    async extractYouTubeTranscript() {
      const formatTime = (seconds) => {
        const totalSeconds = Math.floor(parseFloat(seconds));
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      };

      // Extract video ID from current URL
      const urlParams = new URLSearchParams(window.location.search);
      let videoId = urlParams.get("v");

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
        throw new Error("Could not extract video ID from URL");
      }

      this.log(`Extracting transcript for video ID: ${videoId}`);

      const url = `https://youtube-captions.p.rapidapi.com/transcript?videoId=${videoId}`;
      const options = {
        method: "GET",
        headers: {
          "x-rapidapi-key":
            "7e16663340mshbfb2c833d8dcaffp1f960fjsnc96a63bc6c4c",
          "x-rapidapi-host": "youtube-captions.p.rapidapi.com",
        },
      };

      try {
        const response = await fetch(url, options);
        const transcript = await response.json();
        console.log(
          "🚀 ~ TimedEventSystem ~ extractYouTubeTranscript ~ transcript:",
          transcript
        );
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
      if (!AndroidTTS || typeof AndroidTTS.speak !== "function") {
        return;
      }

      this.currentlySpeaking = true;
      this.speechStartTime = this.video.currentTime;
      this.estimatedSpeechDuration = this.estimateSpeechDuration(text);

      // Mute video when TTS starts
    //   this.muteVideo();

      this.log(
        `Speaking: "${text}" (estimated duration: ${this.estimatedSpeechDuration.toFixed(
          1
        )}s)`
      );

      if (typeof AndroidTTS.speakWithCallback === "function") {
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
      this.log("Speech completed");
      this.processQueuedSpeech();
    }

    processQueuedSpeech() {
      if (
        this.speechQueue.length > 0 &&
        !this.currentlySpeaking &&
        !this.userPaused
      ) {
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
        const timeSinceLastSpeech =
          this.video.currentTime - this.speechStartTime;
        const remainingEstimatedTime = Math.max(
          0,
          this.estimatedSpeechDuration - timeSinceLastSpeech
        );
        const delayUntilOriginalTime = Math.max(
          0,
          originalTime - this.video.currentTime
        );

        if (
          delayUntilOriginalTime > this.maxDelayAllowed ||
          remainingEstimatedTime > delayUntilOriginalTime + 2
        ) {
          this.log("Interrupting current speech for new sentence");
          if (AndroidTTS && typeof AndroidTTS.stopSpeaking === "function") {
            AndroidTTS.stopSpeaking();
          }
          this.currentlySpeaking = false;
          this.speechQueue = [];
          this.speakWithSmartTiming(filteredText, originalTime);
        } else {
          this.speechQueue.push({ text: filteredText, originalTime });
          this.log(
            `Queued speech: "${filteredText}" (queue length: ${this.speechQueue.length})`
          );
        }
      } else {
        this.speakWithSmartTiming(filteredText, originalTime);
      }
    }

    async _translateBatch(eventsToTranslate) {
      if (eventsToTranslate.length === 0) {
        return;
      }

      const texts = eventsToTranslate.map((event) => event.originalText);
      this.log(`Sending batch of ${texts.length} texts for translation.`);

      try {
        const response = await fetch(this.translationEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts, targetLang: this.targetLanguage }),
        });

        if (!response.ok) {
          throw new Error(
            `API error: ${response.status} ${response.statusText}`
          );
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
          this.log("Batch translation successful.");
        } else {
          throw new Error(
            "API response did not indicate success or results were missing."
          );
        }
      } catch (err) {
        this.handleError("Batch translation request failed:", err);
      }
    }

    loadTranscript(transcript) {
      if (!Array.isArray(transcript)) {
        this.handleError("Transcript data must be an array.");
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
        .filter((event) => this.filterTranscriptText(event.text) !== null) // Only keep valid events
        .sort((a, b) => a.time - b.time);

      for (let i = 0; i < this.events.length - 1; i++) {
        const current = this.events[i];
        const next = this.events[i + 1];
        current.gapToNext = next.time - current.time;
      }

      this.currentEventIndex = 0;
      this.log(
        `Loaded ${this.events.length} valid events (filtered from ${transcript.length} total). Starting system.`
      );

      if (this.video) {
        this.start();
      }
    }

    parseTimeToSeconds(timeString) {
      const parts = timeString.split(":").map((part) => parseInt(part, 10));
      let seconds = 0;
      if (parts.length === 3)
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
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

      this.video.addEventListener("timeupdate", this.timeUpdateHandler);
      this.video.addEventListener("seeked", () =>
        this.resetToTime(this.video.currentTime)
      );
      this.video.addEventListener("ended", () => this.stop());

      this.isActive = true;
      this.log("Timed event system started.");
    }

    stop() {
      if (this.timeUpdateHandler && this.video) {
        this.video.removeEventListener("timeupdate", this.timeUpdateHandler);
      }
      this.isActive = false;

      this.stopCurrentSpeech();
      this.log("Timed event system stopped.");
    }

    async translateUpcomingEvents() {
      if (!this.targetLanguage || this.isBatchTranslating) {
        return;
      }

      const eventsToTranslate = this.events
        .slice(
          this.currentEventIndex,
          this.currentEventIndex + this.translationBufferSize
        )
        .filter((event) => event && !event.isTranslated);

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
            this.handleError("Error in onEvent callback", error);
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
      if (
        !this.currentlySpeaking ||
        this.currentEventIndex >= this.events.length
      ) {
        return;
      }

      const nextEvent = this.events[this.currentEventIndex];
      const timeUntilNext = nextEvent.time - currentTime;
      const timeSinceLastSpeech = currentTime - this.speechStartTime;
      const remainingEstimatedTime = Math.max(
        0,
        this.estimatedSpeechDuration - timeSinceLastSpeech
      );

      if (
        remainingEstimatedTime >
        timeUntilNext + this.minGapBetweenSentences
      ) {
        this.log(
          `Potential overlap detected. Remaining: ${remainingEstimatedTime.toFixed(
            1
          )}s, Time until next: ${timeUntilNext.toFixed(1)}s`
        );

        if (AndroidTTS && typeof AndroidTTS.setSpeechRate === "function") {
          const speedMultiplier = Math.min(
            1.5,
            remainingEstimatedTime /
              (timeUntilNext + this.minGapBetweenSentences)
          );
          if (speedMultiplier > 1.1) {
            AndroidTTS.setSpeechRate(speedMultiplier);
            this.log(`Increased speech rate to ${speedMultiplier.toFixed(2)}x`);
          }
        }
      }
    }

    resetToTime(time) {
      this.stopCurrentSpeech();

      if (AndroidTTS && typeof AndroidTTS.setSpeechRate === "function") {
        AndroidTTS.setSpeechRate(1.0);
      }

      this.events.forEach((event) => {
        if (event.time >= time) event.fired = false;
      });

      this.currentEventIndex = this.events.findIndex(
        (event) => event.time >= time
      );
      if (this.currentEventIndex === -1)
        this.currentEventIndex = this.events.length;

      this.log(
        `Reset to time: ${time.toFixed(2)}s, next event index: ${
          this.currentEventIndex
        }`
      );
      this.translateUpcomingEvents();
    }

    log(message, ...args) {
      if (this.debug) console.log(`[TimedEventSystem] ${message}`, ...args);
    }

    handleError(message, details = null) {
      console.error("TimedEventSystem Error:", message, details || "");
    }
  }

  // Main script logic
  async function runMainScript() {
    runs++;

    // Prevent multiple simultaneous executions
    if (isRunning || runs === 1) {
      console.log("Script already running, skipping...");
      return;
    }

    isRunning = true;

    try {
      console.log("Script running for:", location.href);

      // Clean up any existing event system
      if (currentEventSystem) {
        currentEventSystem.cleanup();
        currentEventSystem = null;
      }

      // Only initialize TTS on YouTube watch pages
      if (
        window.location.hostname.includes("youtube.com") &&
        window.location.pathname === "/watch"
      ) {
        if (AndroidTTS) {
          console.log(
            "AndroidTTS interface found. Initializing system with simple button controls and filtering."
          );

          currentEventSystem = new TimedEventSystem({
            debug: true,
            targetLanguage: "ar",
            onEvent: (event) => {
              console.log(
                `EVENT FIRED at ${event.time.toFixed(2)}s: "${event.text}"`
              );
            },
          });

          await currentEventSystem.init();
        } else {
          console.error(
            "AndroidTTS interface not found. The script will not run."
          );
        }
      } else {
        console.log("Not on a YouTube watch page, TTS system not initialized.");
      }
    } catch (error) {
      console.error("Error in runMainScript:", error);
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
      console.log("URL changed from", lastUrl, "to", location.href);
      lastUrl = location.href;
      debouncedRunMainScript();
    }
  });

  observer.observe(document, {
    subtree: true,
    childList: true,
  });

  // History API override
  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function () {
      const result = original.apply(this, arguments);
      console.log("History API called:", method);
      debouncedRunMainScript();
      return result;
    };
  });

  // Handle back/forward buttons
  window.addEventListener("popstate", (event) => {
    console.log("Popstate event triggered");
    debouncedRunMainScript();
  });
})();
