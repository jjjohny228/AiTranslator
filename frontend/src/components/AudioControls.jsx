import { useEffect, useRef, useState } from "react";

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="composer-icon-svg">
      <path
        d="M12 15.5A3.5 3.5 0 0 0 15.5 12V7A3.5 3.5 0 1 0 8.5 7v5A3.5 3.5 0 0 0 12 15.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 11.5v.5A5.5 5.5 0 0 0 18 12v-.5M12 17.5v3M9 20.5h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="composer-icon-svg">
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function AudioControls({ onAudioReady, disabled = false, iconOnly = false }) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      streamRef.current = stream;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onAudioReady(new File([blob], "voice-message.webm", { type: "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (recordingError) {
      setError("Microphone access was denied.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  return (
    <div className="audio-controls">
      <div className="audio-actions">
        {!isRecording ? (
          <button
            type="button"
            className={iconOnly ? "composer-icon-button" : "secondary"}
            onClick={startRecording}
            disabled={disabled}
            aria-label="Record voice"
            title="Record voice"
          >
            {iconOnly ? <MicrophoneIcon /> : "Record voice"}
          </button>
        ) : (
          <button
            type="button"
            className={iconOnly ? "composer-icon-button composer-icon-button--recording" : "danger"}
            onClick={stopRecording}
            aria-label="Stop recording"
            title="Stop recording"
          >
            {iconOnly ? <StopIcon /> : "Stop recording"}
          </button>
        )}
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
