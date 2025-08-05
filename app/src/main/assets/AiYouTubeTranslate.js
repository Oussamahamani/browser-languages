
(async function () {
  "use strict";

  // Prevent multiple instances
  if (window.__myInjectedYoutubeScriptHasRun__) return;
  window.__myInjectedYoutubeScriptHasRun__ = true;
  // SVGs for the icons

  let isRunning = false;
  let debounceTimer = null;
  let lastUrl = location.href;
  let runs = 0;
  let currentEventSystem = null;

  class TimedEventSystem {
    constructor(options = {}) {
      this.onEvent = options.onEvent || (() => {});
      this.debug = options.debug || false;
      this.targetLanguage = options.targetLanguage || null;
      this.translationEndpoint = options.translationEndpoint || "https://browser-production-2e20.up.railway.app/translate/batch";

      this.video = null;
      this.events = [];
      this.currentEventIndex = 0;
      this.isActive = false;
      this.isBatchTranslating = false;

      this.currentlySpeaking = false;
      this.speechQueue = [];
      this.speechStartTime = 0;
      this.estimatedSpeechDuration = 0;
      this.wordsPerMinute = 150;

      this.userPaused = false;
      this.controlButton = null;
    }

    createControls() {
      if (this.controlButton?.parentNode) {
        this.controlButton.parentNode.removeChild(this.controlButton);
      }

    // SVGs for the icons
      const defaultSVG = `
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M824.94-305Q802-305 786-321.04q-16-16.04-16-38.96v-100q0-22.92 16.06-38.96t39-16.04Q848-515 864-498.96q16 16.04 16 38.96v100q0 22.92-16.06 38.96t-39 16.04ZM810-160v-66q-51-8-85-43.5T690-355h30q2 42 32.5 71t72.5 29q42 0 72.5-29t32.5-71h30q-1 50-35 85.5t-85 43.96V-160h-30ZM399-500q-67 0-108.5-41.5T249-650q0-67 41.5-108.5T399-800q7 0 19 1.5t22 3.5q-26 31-38.5 66.5T389-650q0 43 12.5 78.5T440-505q-11.05 2.78-22.52 3.89Q406-500 399-500ZM40-160v-94q0-37 17.5-63t51.5-45q39-22 98-37.5T340-423q-65 31-90.5 75T224-254v94H40Zm559-340q-63 0-106.5-43.5T449-650q0-63 43.5-106.5T599-800q63 0 106.5 43.5T749-650q0 63-43.5 106.5T599-500Zm0-60q38 0 64-26.44T689-650q0-38-26-64t-63.5-26q-37.5 0-64 26T509-650.5q0 37.5 26.44 64T599-560ZM284-160v-94q0-35 18.5-63.5T353-360q47-21 108.5-40.5T599-420q5 0 13.5.5t14.5.5q-6 15-10 29.5t-6 29.5h-12q-72 0-124 16.5T377-306q-16 8-24.5 21.5T344-254v34h304q11 16 26 31.5t35 28.5H284Zm315-490Zm0 430Z"/></svg>
            `;

      const clickedSVG = `
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M825-305q-23 0-39-16t-16-39v-100q0-23 16-39t39-16q23 0 39 16t16 39v100q0 23-16 39t-39 16Zm-15 145v-66q-51-8-85-43.5T690-355h30q2 42 32.5 71t72.5 29q42 0 72.5-29t32.5-71h30q-1 50-35 85.5T840-226v66h-30ZM399-500q-67 0-108.5-41.5T249-650q0-67 41.5-108.5T399-800q7 0 19 1.5t22 3.5q-26 31-38.5 66.5T389-650q0 43 12.5 78.5T440-505q-11 3-22.5 4t-18.5 1ZM40-160v-94q0-37 17.5-63t51.5-45q39-22 98-37.5T340-423q-65 31-90.5 75T224-254v94H40Zm559-340q-63 0-106.5-43.5T449-650q0-63 43.5-106.5T599-800q63 0 106.5 43.5T749-650q0 63-43.5 106.5T599-500ZM284-160v-94q0-35 18.5-63.5T353-360q47-21 108.5-40.5T599-420q5 0 13.5.5t14.5.5q-29 72-5.5 144.5T709-160H284Z"/></svg>
            `;

      this.controlButton = document.createElement("button");
      const svgContainer = document.createElement("span");
          if (window.trustedTypes && window.trustedTypes.createPolicy) {
        const policy = window.trustedTypes.createPolicy("default", {
          createHTML: (input) => input,
        });
        svgContainer.innerHTML = policy.createHTML(defaultSVG);
      } else {
        svgContainer.innerHTML = defaultSVG;
      };

      this.controlButton.addEventListener("mouseenter", () => {
        this.controlButton.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
      });
      this.controlButton.addEventListener("mouseleave", () => {
        this.controlButton.style.backgroundColor = "transparent";
      });
      this.controlButton.addEventListener("click", () => {
        this.toggleTTS();
        svgContainer.innerHTML = this.userPaused ? defaultSVG : clickedSVG;
      });

      this.controlButton.appendChild(svgContainer);
      this.injectButton();
    }

    injectButton() {
      const interval = setInterval(() => {
        const container = document.querySelector(".player-controls-top");
        if (container) {
          clearInterval(interval);
          container.prepend(this.controlButton);
        }
      }, 400);
    }

    toggleTTS() {
      this.userPaused = !this.userPaused;
      if (this.userPaused) {
        this.stopCurrentSpeech();
        this.unmuteVideo();
      } else {
        this.muteVideo();
      }
    }

    muteVideo() {
      if (this.video) this.video.volume = 0;
    }

    unmuteVideo() {
      if (this.video) this.video.volume = 1;
    }

    filterTranscriptText(text) {
      if (!text?.trim()) return null;

      const trimmed = text.trim();
      const soundEffectPatterns = [
        /^\[.*\]$/i, /^\(.*\)$/i, /^.*MUSIC.*$/i, /^.*APPLAUSE.*$/i,
        /^.*LAUGHTER.*$/i, /^.*SOUND.*$/i, /^.*AUDIO.*$/i, /^\*.*\*$/i
      ];

      if (soundEffectPatterns.some(pattern => pattern.test(trimmed))) return null;

      const cleanText = trimmed.replace(/^([A-Z][A-Z\s]+|[A-Za-z\s]+):\s*|\[[^\]]+\]\s*/i, "");
      return cleanText.trim() || null;
    }

    stopCurrentSpeech() {
      AndroidTTS?.stopSpeaking();
      this.currentlySpeaking = false;
      this.speechQueue = [];
    }

    cleanup() {
      this.stop();
      this.stopCurrentSpeech();
      this.unmuteVideo();
      if (this.controlButton?.parentNode) {
        this.controlButton.parentNode.removeChild(this.controlButton);
        this.controlButton = null;
      }
    }

    async init() {
      let attempts = 0;
      while (!this.video && attempts < 20) {
        this.video = document.querySelector("video");
        if (!this.video) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }

      if (!this.video) return;

      document.querySelector(".ytp-unmute")?.remove();
      this.muteVideo();
      this.createControls();
      
      if (window.location.hostname.includes("youtube.com")) {
        try {
          const transcript = await this.extractYouTubeTranscript();
          if (transcript?.length > 0) {
            this.loadTranscript(transcript);
            this.toggleTTS();
          }
        } catch (error) {
          console.error("Failed to extract transcript:", error);
        }
      }
    }

    async extractYouTubeTranscript() {
      const formatTime = (seconds) => {
        const totalSeconds = Math.floor(parseFloat(seconds));
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      };

      const urlParams = new URLSearchParams(window.location.search);
      let videoId = urlParams.get("v") || 
        window.location.href.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)?.[1] ||
        window.location.href.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/)?.[1];

      if (!videoId) throw new Error("Could not extract video ID from URL");

      const response = await fetch(`https://youtube-captions.p.rapidapi.com/transcript?videoId=${videoId}`, {
        headers: {
          "x-rapidapi-key": "7e16663340mshbfb2c833d8dcaffp1f960fjsnc96a63bc6c4c",
          "x-rapidapi-host": "youtube-captions.p.rapidapi.com",
        },
      });

      const transcript = await response.json();
      return transcript
        .filter(item => item.text)
        .map(item => ({
          time: formatTime(item.start),
          dur: parseFloat(item.dur),
          text: item.text,
        }));
    }

    estimateSpeechDuration(text) {
      return Math.max((text.split(/\s+/).length / this.wordsPerMinute) * 60, 1);
    }

    speakWithSmartTiming(text) {
      if (!AndroidTTS?.speak) return;

      this.currentlySpeaking = true;
      this.speechStartTime = this.video.currentTime;
      this.estimatedSpeechDuration = this.estimateSpeechDuration(text);

      if (AndroidTTS.speakWithCallback) {
        const callbackName = `speechComplete_${Date.now()}`;
        window[callbackName] = () => {
          this.onSpeechComplete();
          delete window[callbackName];
        };
        AndroidTTS.speakWithCallback(text, callbackName);
      } else {
        AndroidTTS.speak(text);
        setTimeout(() => this.onSpeechComplete(), this.estimatedSpeechDuration * 1000);
      }
    }

    onSpeechComplete() {
      this.currentlySpeaking = false;
      this.processQueuedSpeech();
    }

    processQueuedSpeech() {
      if (this.speechQueue.length > 0 && !this.currentlySpeaking && !this.userPaused) {
        const nextSpeech = this.speechQueue.shift();
        this.speakWithSmartTiming(nextSpeech.text);
      }
    }

    queueOrSpeak(text) {
      if (this.userPaused) return;

      const filteredText = this.filterTranscriptText(text);
      if (!filteredText) return;

      if (this.currentlySpeaking) {
        this.speechQueue.push({ text: filteredText });
      } else {
        this.speakWithSmartTiming(filteredText);
      }
    }

    async _translateBatch(eventsToTranslate) {
      if (!eventsToTranslate.length) return;

      const texts = eventsToTranslate.map(event => event.originalText);
      try {
        const response = await fetch(this.translationEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts, language: 'arabic' }),
        });

        const data = await response.json();
        if (data.success && data.results) {
          data.results.forEach((result, i) => {
            if (result.translated) {
              eventsToTranslate[i].text = result.translated;
              eventsToTranslate[i].isTranslated = true;
            }
          });
        }
      } catch (err) {
        console.error("Translation failed:", err);
      }
    }

    loadTranscript(transcript) {
      if (!Array.isArray(transcript)) return;

      this.events = transcript
        .map((item, index) => ({
          id: `event_${index}`,
          time: this.parseTimeToSeconds(item.time),
          text: item.text,
          originalText: item.text,
          isTranslated: false,
          fired: false,
        }))
        .filter(event => this.filterTranscriptText(event.text))
        .sort((a, b) => a.time - b.time);

      this.currentEventIndex = 0;
      if (this.video) this.start();
    }

    parseTimeToSeconds(timeString) {
      const parts = timeString.split(":").map(part => parseInt(part, 10));
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
    }

    start() {
      if (!this.video || this.isActive || !this.events.length) return;

      this.timeUpdateHandler = () => {
        const currentTime = this.video.currentTime;
        this.processEvents(currentTime);
      };

      this.video.addEventListener("timeupdate", this.timeUpdateHandler);
      this.video.addEventListener("seeked", () => this.resetToTime(this.video.currentTime));
      this.video.addEventListener("ended", () => this.stop());

      this.isActive = true;
    }

    stop() {
      if (this.timeUpdateHandler && this.video) {
        this.video.removeEventListener("timeupdate", this.timeUpdateHandler);
      }
      this.isActive = false;
      this.stopCurrentSpeech();
    }

    async translateUpcomingEvents() {
      if (!this.targetLanguage || this.isBatchTranslating) return;

      const eventsToTranslate = this.events
        .slice(this.currentEventIndex, this.currentEventIndex + 10)
        .filter(event => !event.isTranslated);

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
          this.queueOrSpeak(event.text);
          this.onEvent(event);
          event.fired = true;
          this.currentEventIndex++;
        } else if (currentTime < event.time) {
          break;
        } else {
          this.currentEventIndex++;
        }
      }
    }


    resetToTime(time) {
      this.stopCurrentSpeech();
      AndroidTTS?.setSpeechRate?.(1.0);

      this.events.forEach(event => {
        if (event.time >= time) event.fired = false;
      });

      this.currentEventIndex = this.events.findIndex(event => event.time >= time);
      if (this.currentEventIndex === -1) this.currentEventIndex = this.events.length;
      
      this.translateUpcomingEvents();
    }

    log(message) {
      if (this.debug) console.log(`[TimedEventSystem] ${message}`);
    }
  }

  async function runMainScript() {
    runs++;
    if (isRunning || runs === 1) return;
    isRunning = true;

    try {
      if (currentEventSystem) {
        currentEventSystem.cleanup();
        currentEventSystem = null;
      }

      if (window.location.hostname.includes("youtube.com") && 
          window.location.pathname === "/watch" && AndroidTTS) {
        currentEventSystem = new TimedEventSystem({
          debug: true,
          targetLanguage: "ar",
          onEvent: (event) => console.log(`EVENT: ${event.text}`),
        });
        await currentEventSystem.init();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      isRunning = false;
    }
  }

  function debouncedRunMainScript() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runMainScript, 150);
  }

  await runMainScript();

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      debouncedRunMainScript();
    }
  });

  observer.observe(document, { subtree: true, childList: true });

  ["pushState", "replaceState"].forEach(method => {
    const original = history[method];
    history[method] = function () {
      const result = original.apply(this, arguments);
      debouncedRunMainScript();
      return result;
    };
  });

  window.addEventListener("popstate", debouncedRunMainScript);
})();
