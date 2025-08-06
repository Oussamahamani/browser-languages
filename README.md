# Polynet — The Internet, in Your Language

Polynet is a Chromium-based Android web browser powered by the Gemma 3n model that translates all internet content — text, images, and videos — into your native language in real time. It breaks down language barriers, enabling seamless access to the entire web regardless of language.

---

## 🚀 Key Features

- **Full Webpage Translation**: AI-powered on-the-fly translation of text content preserving page structure.
- **Image & Infographic Translation**: OCR-based extraction and overlay translation of text in images.
- **Real-Time Video Dubbing**: On-device text-to-speech dubbing of YouTube videos in multiple languages.
- **Privacy First**: All translation happens on-device to ensure speed and user privacy.

---

## 🛠️ Technical Overview

### Project Architecture

Polynet builds on top of **SmartCookieWeb**, an open-source lightweight Chromium-based browser tailored for easy customization and fast prototyping. This foundation allows integration of translation features with minimal overhead.

#### Core Components

- **Gemma 3N 2B model**: Handles all translation tasks for text, images, and video captions on-device.
- **Google ML Kit OCR**: Extracts text and coordinates from images for translation overlays.
- **JavaScript Injection**: Dynamically replaces webpage text and redraws translated content without breaking layout.
- **On-device Text-to-Speech (TTS)**: Generates dubbed audio for translated video captions.
- **Custom Kotlin/JavaScript Bridge**: Coordinates communication between the Android app and webpage DOM.

---

### Feature Breakdown

#### 1. Webpage Translation

- Text nodes are parsed and extracted from the DOM via JavaScript.
- Sent to Gemma 3N for translation with prompt conditioning for context.
- Translated text is reinjected preserving formatting and user experience.

#### 2. Image & Infographic Translation

- ML Kit OCR scans images on the page to extract text and layout information.
- Gemma translates the extracted text.
- JS overlays draw translated text at precise image coordinates.
- Current challenge: maintaining natural visual aesthetics on overlays.

#### 3. YouTube Video Dubbing

- YouTube video transcripts are fetched through available APIs.
- Captions are translated and converted to speech on-device.
- A custom UI button toggles the dubbed audio track.
- Future plans include real-time sync and voiceover improvements.

---

### Challenges & Learnings

- **Gemma Latency**: Large page translations require prompt length optimization and batching.
- **Concurrency Handling**: Synchronizing multiple simultaneous translation requests to avoid crashes.
- **Feature Isolation**: Restricting active translation modules to conserve memory and improve stability.
- **Image Translation Rendering**: Overlay translation is an ongoing challenge to maintain aesthetics and readability.

---

## 🧩 About SmartCookieWeb

[SmartCookieWeb](https://github.com/CookieJarApps/SmartCookieWeb) is an open-source Chromium-based Android web browser designed for extensibility and lightweight performance. PolyNet uses SmartCookieWeb as its base browser to leverage its built-in Chromium rendering engine and customizable architecture, allowing seamless injection and manipulation of webpage content required for advanced translation features.

---

## 🔭 Roadmap & Next Steps

- Optimize batching and prompt size to improve translation speed.
- Enhance subtitle auto-alignment and dubbing synchronization.
- Improve image text translation with layout-aware rendering or inpainting.
- Develop **PolyGlobe Explorer Mode** for seamless bilingual browsing with input/output translation.

---

## ⚠️ Note

This project is an experimental prototype. Performance may vary based on device specifications. Testing was primarily done on Pixel 9 Pro; occasional app crashes or slowdowns may occur.

If translation features do not work as expected:

- Try refreshing the page.
- Navigate to a different link and restart the app.

---

## 📄 License

This project is licensed under the [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) license.


CC BY 4.0 allows others to **copy, redistribute, remix, transform, and build upon this work for any purpose, including commercial use**, as long as proper attribution is given.

---


---



**Polynet — Unlock the rest of the web.  
The internet, in your language.**
