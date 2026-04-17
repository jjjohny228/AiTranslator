import { useEffect, useRef, useState } from "react";

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    function syncDuration() {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    }

    function handleTimeUpdate() {
      setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    }

    function handleEnded() {
      setIsPlaying(false);
      setCurrentTime(0);
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    syncDuration();

    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("loadeddata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("canplay", syncDuration);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("loadeddata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("canplay", syncDuration);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.load();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (isPlaying) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  }

  function handleSeek(event) {
    const audio = audioRef.current;
    if (!audio || !duration) {
      return;
    }
    const nextTime = Number(event.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="audio-player-shell">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" className="audio-player__button" onClick={togglePlayback} aria-label={isPlaying ? "Pause audio" : "Play audio"}>
        {isPlaying ? "Pause" : "Play"}
      </button>
      <div className="audio-player__meta">
        <div className="audio-player__timeline">
          <div className="audio-player__track">
            <input
              className="audio-player__range"
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={Math.min(currentTime, duration || 0)}
              onChange={handleSeek}
              aria-label="Audio progress"
            />
            <div
              className="audio-player__progress"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>
        </div>
      </div>
      <span className="audio-player__time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}
