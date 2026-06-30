/**
 * speechToScriptureTour.ts — Interactive onboarding for Speech To Scripture.
 *
 * 11-step event-driven setup wizard that waits for user actions
 * before advancing through blocking steps (mic selection, listening, speech detection).
 *
 * Unlike the passive tour, this variant:
 * - Validates user actions before allowing progression
 * - Shows helper messages when stuck
 * - Auto-advances when conditions are met
 * - Provides a completion checklist at the end
 */

import type { InteractiveStep } from "./InteractiveOnboardingTour";

/** localStorage key for tour completion status */
export const SPEECH_TOUR_KEY = "speechToScriptureTourCompleted";

/**
 * Context from the page state, used for step validation.
 * Passed as a closure from SpeechToScripturePage.
 */
export interface TourContext {
  snapshot: {
    status: string;
    entries: unknown[];
    suggestions: unknown[];
    queue: unknown[];
  };
  selectedMic: string;
}

/**
 * Returns the 11-step interactive tour configuration.
 * Must be called with live page state so validation functions
 * close over current snapshot/selectedMic.
 */
export function getSpeechTourSteps(ctx: TourContext): InteractiveStep[] {
  return [
    // ── Step 1: Credits Remaining (informational) ──
    {
      target: '[data-onboard-id="credits"]',
      title: "Credits Remaining",
      description:
        "Your transcription credits are shown here.\n\nEach minute of live transcription uses 1 credit. Credits are deducted when you stop listening and the transcript is saved.",
      icon: "credit",
      features: [
        "Credits are used per minute of audio",
        "Your plan determines your monthly allocation",
        "Credits sync across your devices",
      ],
    },

    // ── Step 2: Select Microphone (BLOCKING) ──
    {
      target: '[data-onboard-id="mic-dropdown"]',
      title: "Choose Your Microphone",
      description:
        "Select the microphone that will capture audio for transcription.\n\nUse the same microphone connected to your pulpit, mixer, or speaking device.",
      icon: "mic",
      features: [
        "Use a clear, direct audio source",
        "Avoid laptop built-in microphones",
        "Ensure the mic is not muted",
      ],
      validate: () => ctx.selectedMic !== "",
      successMessage: "Microphone selected!",
      helperMessage: "Click the microphone dropdown and select your audio input device.",
      helperTimeout: 6000,
      autoAdvance: true,
      autoAdvanceDelay: 1200,
      showSkip: false,
    },

    // ── Step 3: Copy To Dock (informational) ──
    {
      target: '[data-onboard-id="copy-to-dock"]',
      title: "Copy To Dock",
      description:
        "Copy the Dock URL to your clipboard.\n\nPaste this URL into a browser source in OBS to display live scripture overlays for your congregation and livestream.",
      icon: "link",
      features: [
        "Paste into OBS as a Browser Source",
        "Shows scripture in real time",
        "Works with any OBS scene",
      ],
    },

    // ── Step 4: Start Listening (BLOCKING) ──
    {
      target: '[data-onboard-id="start-listening"]',
      title: "Start Listening",
      description:
        "Click Start Listening to begin capturing audio.\n\nSpeech To Scripture will:\n• Listen to your voice\n• Convert speech to text\n• Detect Bible references\n• Search for matching verses\n\nNothing is broadcast automatically. You remain in control.",
      icon: "radio",
      validate: () => ctx.snapshot.status === "listening",
      successMessage: "Listening started!",
      helperMessage: "Click the Start Listening button to begin capturing audio.",
      helperTimeout: 5000,
      autoAdvance: true,
      autoAdvanceDelay: 1200,
      showSkip: false,
    },

    // ── Step 5: Test Speech (BLOCKING) ──
    {
      target: '[data-onboard-id="live-transcript"]',
      title: "Test Your Audio",
      description:
        "Speak into your microphone to test the connection.\n\nYou should see your words appear in the Live Transcript panel within a few seconds.",
      icon: "list",
      validate: () => ctx.snapshot.entries.length > 0,
      successMessage: "Speech detected — transcription is working!",
      helperMessage: "Try speaking into your microphone. Your words should appear here.",
      helperTimeout: 10000,
      autoAdvance: true,
      autoAdvanceDelay: 1500,
      showSkip: false,
    },

    // ── Step 6: Live Transcript (informational) ──
    {
      target: '[data-onboard-id="live-transcript"]',
      title: "Live Transcript",
      description:
        "Your spoken words appear here in real time.\n\nEvery sentence is captured and stored during the session.",
      icon: "list",
      features: [
        "Live transcription as you speak",
        "Search through your transcript",
        "Copy any line with one click",
        "Download as TXT or SRT",
      ],
    },

    // ── Step 7: Top Match (informational) ──
    {
      target: '[data-onboard-id="top-match"]',
      title: "Current Verse Match",
      description:
        "When a scripture quotation or Bible reference is detected, the best matching verse appears here.\n\nExamples:\n• \"John 3:16\"\n• \"For God so loved the world…\"\n\nThis panel shows the highest confidence match.",
      icon: "book",
      features: [
        "Auto-detected from your speech",
        "Shows verse text and reference",
        "Copy or push to broadcast",
        "Ranked by confidence score",
      ],
    },

    // ── Step 8: Detected References (informational) ──
    {
      target: '[data-onboard-id="detected-refs"]',
      title: "Detected References",
      description:
        "Direct Bible references are listed here as they are detected.\n\nExamples:\n• Romans 8:28\n• John 3:16\n• Psalm 23:1\n\nThese remain available throughout the session.",
      icon: "book",
    },

    // ── Step 9: Candidate Matches (informational) ──
    {
      target: '[data-onboard-id="candidate-matches"]',
      title: "Candidate Matches",
      description:
        "Sometimes a quote can match multiple verses.\n\nThis section shows all possible matches ranked by confidence.\n\nHigher percentages indicate stronger matches. Review results before sending them to broadcast.",
      icon: "list",
    },

    // ── Step 10: Broadcast Status (informational) ──
    {
      target: '[data-onboard-id="broadcast-status"]',
      title: "Broadcast Status",
      description:
        "This indicator shows your OBS connection status.\n\nWhen connected, you can push scripture directly to your OBS overlay.\n\nWhen disconnected, you can still use Speech To Scripture — just without the live broadcast feature.",
      icon: "radio",
      features: [
        "Shows OBS connection status",
        "Push verse to broadcast with one click",
        "Works offline — just no live overlay",
      ],
    },

    // ── Step 11: Completion with Checklist ──
    {
      title: "You're All Set",
      description:
        "Speech To Scripture is ready to use. Here's what you've set up:",
      icon: "check",
      isComplete: true,
      completeLabel: "Start Using Speech To Scripture",
      features: [
        `${ctx.selectedMic ? "✓" : "○"} Microphone selected`,
        `${ctx.snapshot.status === "listening" ? "✓" : "○"} Listening started`,
        `${ctx.snapshot.entries.length > 0 ? "✓" : "○"} Speech detected`,
        `${ctx.snapshot.suggestions.length > 0 || ctx.snapshot.queue.length > 0 ? "✓" : "○"} Verse matching working`,
        `${ctx.snapshot.status === "listening" ? "✓" : "○"} Transcript generating`,
      ],
    },
  ];
}
