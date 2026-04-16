import { useEffect, useRef, useState } from "react";

export function AudioControls({ onAudioReady, disabled = false }) {
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
          <button type="button" className="secondary" onClick={startRecording} disabled={disabled}>
            Record voice
          </button>
        ) : (
          <button type="button" className="danger" onClick={stopRecording}>
            Stop recording
          </button>
        )}
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
