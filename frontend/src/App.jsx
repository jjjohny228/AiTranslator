import { useEffect, useMemo, useRef, useState } from "react";
import { AudioControls } from "./components/AudioControls";
import { CondomBurst } from "./components/CondomBurst";
import { LanguageSelect } from "./components/LanguageSelect";
import { ModePicker } from "./components/ModePicker";
import { RoomQrCode } from "./components/RoomQrCode";
import { VoiceStudio } from "./components/VoiceStudio";
import {
  base64ToAudioUrl,
  createRoom,
  fetchMe,
  fetchRoom,
  fetchVoiceProfile,
  login,
  register,
  sendRoomAudioMessage,
  sendRoomTextMessage,
  updateRoomPreferences,
} from "./lib/api";

const languageOptions = [
  { value: "English", label: "English" },
  { value: "Ukrainian", label: "Ukrainian" },
  { value: "Russian", label: "Russian" },
  { value: "German", label: "German" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "Polish", label: "Polish" },
];

const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

function getRoomLink(roomId, role = "a") {
  if (!roomId) {
    return "";
  }
  return `${window.location.origin}${window.location.pathname}?room=${roomId}&role=${role}`;
}

function normalizeRoom(room) {
  return {
    ...room,
    messages: room.messages.map((message) => ({
      ...message,
      audioUrl: base64ToAudioUrl(message.audio_base64, message.audio_mime_type),
    })),
  };
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    display_name: "",
  });
  const [voiceProfile, setVoiceProfile] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [participants, setParticipants] = useState({
    a: { name: "You", language: "English", gender: "male" },
    b: { name: "Partner", language: "Ukrainian", gender: "female" },
  });
  const [room, setRoom] = useState(null);
  const [activeSpeaker, setActiveSpeaker] = useState("a");
  const [mode, setMode] = useState("balanced");
  const [synthesizeResponses, setSynthesizeResponses] = useState(false);
  const [autoPlayVoice, setAutoPlayVoice] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isBootingRoom, setIsBootingRoom] = useState(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isSubmittingText, setIsSubmittingText] = useState(false);
  const [isSubmittingAudio, setIsSubmittingAudio] = useState(false);
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
  const streamEndRef = useRef(null);
  const previousMessageCountRef = useRef(0);

  const roomLink = useMemo(() => getRoomLink(room?.id, "a"), [room?.id]);
  const partnerInviteLink = useMemo(() => getRoomLink(room?.id, "b"), [room?.id]);

  useEffect(() => {
    async function bootstrapAuth() {
      const storedToken = window.localStorage.getItem("lingua_voice_token") ?? "";
      if (!storedToken) {
        setAuthReady(true);
        return;
      }
      try {
        const user = await fetchMe(storedToken);
        setAuthToken(storedToken);
        setAuthUser(user);
        const profile = await fetchVoiceProfile(storedToken);
        setVoiceProfile(profile);
      } catch {
        window.localStorage.removeItem("lingua_voice_token");
      } finally {
        setAuthReady(true);
      }
    }
    void bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!room) {
      previousMessageCountRef.current = 0;
      return;
    }

    const currentCount = room.messages.length;
    const previousCount = previousMessageCountRef.current;
    const documentHeight = document.documentElement.scrollHeight;
    const viewportBottom = window.scrollY + window.innerHeight;
    const nearBottom = documentHeight - viewportBottom < 220;

    if (currentCount > previousCount && (nearBottom || previousCount === 0)) {
      streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    previousMessageCountRef.current = currentCount;
  }, [room?.id, room?.messages.length]);

  useEffect(() => {
    if (!authReady) {
      return;
    }
    async function bootRoomFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const roomId = params.get("room");
      const role = params.get("role");
      if (!roomId) {
        setIsBootingRoom(false);
        return;
      }

      try {
        const nextRoom = await fetchRoom(roomId);
        setRoom(normalizeRoom(nextRoom));
        setParticipants({
          a: nextRoom.participant_a,
          b: nextRoom.participant_b,
        });
        if (role === "a" || role === "b") {
          setActiveSpeaker(role);
        }
        setMode(nextRoom.mode);
        setSynthesizeResponses(nextRoom.synthesize_responses);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setIsBootingRoom(false);
      }
    }

    void bootRoomFromUrl();
  }, [authReady]);

  useEffect(() => {
    if (!room?.id) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const latestRoom = await fetchRoom(room.id);
        setRoom(normalizeRoom(latestRoom));
        setMode(latestRoom.mode);
        setSynthesizeResponses(latestRoom.synthesize_responses);
      } catch {
        // Keep the last known room state if polling fails transiently.
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [room?.id]);

  function updateParticipant(key, field, value) {
    setParticipants((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      },
    }));
  }

  function getSpeakerData(speaker) {
    return speaker === "a"
      ? { source: room?.participant_a ?? participants.a, target: room?.participant_b ?? participants.b }
      : { source: room?.participant_b ?? participants.b, target: room?.participant_a ?? participants.a };
  }

  async function handleCreateRoom() {
    setIsCreatingRoom(true);
    setError("");
    try {
      const nextRoom = await createRoom({
        participant_a: participants.a,
        participant_b: participants.b,
        mode,
        synthesize_responses: synthesizeResponses,
      });
      const normalized = normalizeRoom(nextRoom);
      setRoom(normalized);
      const nextLink = getRoomLink(normalized.id, "b");
      window.history.replaceState({}, "", `?room=${normalized.id}&role=a`);
      if (nextLink) {
        await navigator.clipboard?.writeText(nextLink).catch(() => {});
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsCreatingRoom(false);
    }
  }

  async function syncRoomPreferences(nextMode, nextSynthesize) {
    if (!room?.id) {
      setMode(nextMode);
      setSynthesizeResponses(nextSynthesize);
      return;
    }
    setIsUpdatingRoom(true);
    setMode(nextMode);
    setSynthesizeResponses(nextSynthesize);
    try {
      const updatedRoom = await updateRoomPreferences(room.id, {
        mode: nextMode,
        synthesize_responses: nextSynthesize,
      });
      setRoom(normalizeRoom(updatedRoom));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsUpdatingRoom(false);
    }
  }

  async function copyRoomLink() {
    if (!roomLink) {
      return;
    }
    await navigator.clipboard?.writeText(roomLink).catch(() => {});
  }

  async function sendTextMessage() {
    if (!room?.id) {
      setError("Create a room first.");
      return;
    }
    if (!authToken) {
      setError("Sign in to send messages.");
      return;
    }
    if (!draft.trim()) {
      setError("Write a message before sending.");
      return;
    }

    setIsSubmittingText(true);
    setError("");
    const text = draft.trim();
    setDraft("");
    try {
      const createdMessage = await sendRoomTextMessage(room.id, {
        speaker: activeSpeaker,
        text,
      }, authToken);
      const nextMessage = {
        ...createdMessage,
        audioUrl: base64ToAudioUrl(createdMessage.audio_base64, createdMessage.audio_mime_type),
      };
      setRoom((current) =>
        current
          ? {
              ...current,
              messages: [...current.messages, nextMessage],
            }
          : current,
      );
      if (synthesizeResponses && autoPlayVoice && nextMessage.audioUrl) {
        const audio = new Audio(nextMessage.audioUrl);
        void audio.play().catch(() => {});
      }
    } catch (requestError) {
      console.error("Room text send failed", requestError);
      setError(requestError.message);
    } finally {
      setIsSubmittingText(false);
    }
  }

  async function sendAudioMessage(file) {
    if (!room?.id) {
      setError("Create a room first.");
      return;
    }
    if (!authToken) {
      setError("Sign in to send messages.");
      return;
    }
    setIsSubmittingAudio(true);
    setError("");
    try {
      const createdMessage = await sendRoomAudioMessage(room.id, activeSpeaker, file, authToken);
      const nextMessage = {
        ...createdMessage,
        audioUrl: base64ToAudioUrl(createdMessage.audio_base64, createdMessage.audio_mime_type),
      };
      setRoom((current) =>
        current
          ? {
              ...current,
              messages: [...current.messages, nextMessage],
            }
          : current,
      );
      if (synthesizeResponses && autoPlayVoice && nextMessage.audioUrl) {
        const audio = new Audio(nextMessage.audioUrl);
        void audio.play().catch(() => {});
      }
    } catch (requestError) {
      console.error("Room audio send failed", requestError);
      setError(requestError.message);
    } finally {
      setIsSubmittingAudio(false);
    }
  }

  function renderMessage(message) {
    const speaker = message.speaker === "a" ? room.participant_a : room.participant_b;
    const target = message.speaker === "a" ? room.participant_b : room.participant_a;

    return (
      <article
        key={message.id}
        className={`message-row ${message.speaker === "a" ? "message-row--self" : "message-row--peer"}`}
      >
        <div className={`message-card message-card--${message.speaker}`}>
          <div className="message-meta">
            <div>
              <strong>{speaker.name}</strong>
              <span>
                {speaker.language} to {target.language}
              </span>
            </div>
            {message.status !== "done" ? (
              <span className={`status-pill status-pill--${message.status}`}>{message.status}</span>
            ) : null}
          </div>

          {message.kind === "audio" ? (
            <div className="voice-badge">
              <span className="voice-wave" />
              <span>{message.attachment_name ?? "Voice note"}</span>
            </div>
          ) : null}

          <div className="message-copy">
            <div className="copy-block">
              <span className="copy-label">Original</span>
              <p>{message.original_text}</p>
            </div>
            <div className="copy-block copy-block--accent">
              <span className="copy-label">Translated</span>
              <p>{message.translated_text}</p>
            </div>
          </div>

          {message.audioUrl ? <audio controls src={message.audioUrl} className="audio-player" /> : null}
        </div>
      </article>
    );
  }

  const busy = isSubmittingText || isSubmittingAudio || isUpdatingRoom;
  const activeSpeakerMeta = getSpeakerData(activeSpeaker).source;

  async function submitAuth() {
    setError("");
    try {
      const response =
        authMode === "login"
          ? await login({ email: authForm.email, password: authForm.password })
          : await register(authForm);
      window.localStorage.setItem("lingua_voice_token", response.token);
      setAuthToken(response.token);
      setAuthUser(response.user);
      const profile = await fetchVoiceProfile(response.token);
      setVoiceProfile(profile);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function signOut() {
    window.localStorage.removeItem("lingua_voice_token");
    setAuthToken("");
    setAuthUser(null);
    setVoiceProfile(null);
    setShowProfile(false);
  }

  if (!authReady) {
    return (
      <>
        <CondomBurst />
        <main className="setup-shell">
          <section className="setup-hero">
            <div className="eyebrow">Booting identity layer...</div>
            <h1>Connecting your neon passport.</h1>
          </section>
        </main>
      </>
    );
  }

  if (!authUser) {
    return (
      <>
        <CondomBurst />
        <main className="setup-shell">
          <section className="setup-hero">
            <div className="eyebrow">Secure access</div>
            <h1>Sign in before entering the translation room.</h1>
            <p className="subtitle">
              Authentication unlocks profile settings, custom voice training, and personal voice playback inside shared rooms.
            </p>
          </section>

          <section className="setup-card auth-card">
            <div className="setup-controls">
              <div>
                <span className="field-label">Account mode</span>
                <ModePicker
                  value={authMode === "login" ? "balanced" : "natural"}
                  onChange={(value) => setAuthMode(value === "balanced" ? "login" : "register")}
                  compact
                />
              </div>
            </div>

            {authMode === "register" ? (
              <label className="field">
                <span>Display name</span>
                <input
                  value={authForm.display_name}
                  onChange={(event) => setAuthForm((current) => ({ ...current, display_name: event.target.value }))}
                  placeholder="Your public name"
                />
              </label>
            ) : null}

            <label className="field">
              <span>Email</span>
              <input
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="you@example.com"
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Minimum 8 characters"
              />
            </label>

            <button type="button" className="primary-cta" onClick={submitAuth}>
              {authMode === "login" ? "Sign in" : "Create account"}
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
            >
              {authMode === "login" ? "Need an account?" : "Already have an account?"}
            </button>

            {error ? <p className="error-banner">{error}</p> : null}
          </section>
        </main>
      </>
    );
  }

  if (isBootingRoom) {
    return (
      <>
        <CondomBurst />
        <main className="setup-shell">
          <section className="setup-hero">
            <div className="eyebrow">Preparing room...</div>
            <h1>Opening your translation room.</h1>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <CondomBurst />
      {!room ? (
        <main className="setup-shell">
          <section className="setup-hero">
            <div className="eyebrow">Shared translation room</div>
            <h1>Create a bilingual room and invite anyone by link or QR.</h1>
            <p className="subtitle">
              Perfect for two people speaking different languages. Each message is translated and
              saved in a shared chat that others can join instantly.
            </p>
            <div className="header-actions">
              <button type="button" className="secondary" onClick={() => setShowProfile((current) => !current)}>
                {showProfile ? "Hide profile" : "Profile"}
              </button>
              <button type="button" className="secondary" onClick={signOut}>
                Sign out
              </button>
            </div>
          </section>

          {showProfile ? (
            <VoiceStudio
              token={authToken}
              user={authUser}
              voiceProfile={voiceProfile}
              onProfileUpdated={setVoiceProfile}
              languageOptions={languageOptions}
              genderOptions={genderOptions}
            />
          ) : null}

          <section className="setup-card">
            <div className="setup-grid">
              <div className="identity-card">
                <span className="identity-kicker">Speaker A</span>
                <input
                  className="name-input"
                  value={participants.a.name}
                  onChange={(event) => updateParticipant("a", "name", event.target.value)}
                  placeholder="Your name"
                />
                <LanguageSelect
                  label="Language"
                  value={participants.a.language}
                  onChange={(value) => updateParticipant("a", "language", value)}
                  options={languageOptions}
                />
                <LanguageSelect
                  label="Gender"
                  value={participants.a.gender}
                  onChange={(value) => updateParticipant("a", "gender", value)}
                  options={genderOptions}
                />
              </div>

              <div className="identity-card identity-card--contrast">
                <span className="identity-kicker">Speaker B</span>
                <input
                  className="name-input"
                  value={participants.b.name}
                  onChange={(event) => updateParticipant("b", "name", event.target.value)}
                  placeholder="Partner name"
                />
                <LanguageSelect
                  label="Language"
                  value={participants.b.language}
                  onChange={(value) => updateParticipant("b", "language", value)}
                  options={languageOptions}
                />
                <LanguageSelect
                  label="Gender"
                  value={participants.b.gender}
                  onChange={(value) => updateParticipant("b", "gender", value)}
                  options={genderOptions}
                />
              </div>
            </div>

            <div className="setup-controls">
              <div>
                <span className="field-label">Translation style</span>
                <ModePicker value={mode} onChange={setMode} />
              </div>
              <div className="toggle-stack">
                <label className="checkbox checkbox--inline">
                  <input
                    type="checkbox"
                    checked={synthesizeResponses}
                    onChange={(event) => setSynthesizeResponses(event.target.checked)}
                  />
                  Generate spoken translated replies
                </label>
                <label className="checkbox checkbox--inline">
                  <input
                    type="checkbox"
                    checked={autoPlayVoice}
                    onChange={(event) => setAutoPlayVoice(event.target.checked)}
                    disabled={!synthesizeResponses}
                  />
                  Auto-play translated audio on this device
                </label>
              </div>
            </div>

            <button type="button" className="primary-cta" onClick={handleCreateRoom} disabled={isCreatingRoom}>
              {isCreatingRoom ? "Creating room..." : "Create room"}
            </button>

            {error ? <p className="error-banner">{error}</p> : null}
          </section>
        </main>
      ) : (
        <main className="chat-shell">
          <header className="chat-header">
            <div>
              <div className="eyebrow">Room {room.id}</div>
              <h2>
                {room.participant_a.name} and {room.participant_b.name}
              </h2>
              <p>
                {room.participant_a.language} ↔ {room.participant_b.language}
              </p>
            </div>
            <div className="header-actions">
              <button type="button" className="secondary" onClick={() => setShowProfile((current) => !current)}>
                {showProfile ? "Hide profile" : "Profile"}
              </button>
              <button type="button" className="secondary" onClick={copyRoomLink}>
                Copy host link
              </button>
              <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(partnerInviteLink).catch(() => {})}>
                Copy invite link
              </button>
              <button
                type="button"
                className="swap-button"
                onClick={() => {
                  window.history.replaceState({}, "", window.location.pathname);
                  setRoom(null);
                  setError("");
                }}
              >
                New room
              </button>
              <button type="button" className="secondary" onClick={signOut}>
                Sign out
              </button>
            </div>
          </header>

          {showProfile ? (
            <VoiceStudio
              token={authToken}
              user={authUser}
              voiceProfile={voiceProfile}
              onProfileUpdated={setVoiceProfile}
              languageOptions={languageOptions}
              genderOptions={genderOptions}
            />
          ) : null}

          <section className="chat-layout">
            <aside className="participants-panel">
              <div className="share-card">
                <span className="field-label">Invite partner</span>
                <RoomQrCode value={partnerInviteLink} />
                <a className="room-link" href={partnerInviteLink}>
                  {partnerInviteLink}
                </a>
              </div>

              <button
                type="button"
                className={`speaker-card ${activeSpeaker === "a" ? "speaker-card--active" : ""}`}
                onClick={() => setActiveSpeaker("a")}
              >
                <span className="speaker-tag">Now speaking</span>
                <strong>{room.participant_a.name}</strong>
                <span>{room.participant_a.language}</span>
              </button>

              <button
                type="button"
                className={`speaker-card ${activeSpeaker === "b" ? "speaker-card--active" : ""}`}
                onClick={() => setActiveSpeaker("b")}
              >
                <span className="speaker-tag">Tap to switch</span>
                <strong>{room.participant_b.name}</strong>
                <span>{room.participant_b.language}</span>
              </button>

              <div className="mode-card">
                <span className="field-label">Room style</span>
                <ModePicker value={mode} onChange={(value) => void syncRoomPreferences(value, synthesizeResponses)} compact />
                <label className="checkbox checkbox--inline">
                  <input
                    type="checkbox"
                    checked={synthesizeResponses}
                    onChange={(event) => void syncRoomPreferences(mode, event.target.checked)}
                  />
                  Voice replies in this room
                </label>
              </div>
            </aside>

            <section className="conversation-panel">
              <div className="messages-stream">
                {room.messages.length ? (
                  room.messages.map(renderMessage)
                ) : (
                  <div className="timeline-note">
                    <span>Room is ready. Share the link or QR and start talking.</span>
                  </div>
                )}
                <div ref={streamEndRef} />
              </div>

              <div className="composer-card">
                <div className="composer-topline">
                  <div>
                    <span className="field-label">Active speaker</span>
                    <strong>
                      {activeSpeakerMeta.name} speaking {activeSpeakerMeta.language}
                    </strong>
                  </div>
                  <label className="checkbox checkbox--inline">
                    <input
                      type="checkbox"
                      checked={autoPlayVoice}
                      onChange={(event) => setAutoPlayVoice(event.target.checked)}
                      disabled={!synthesizeResponses}
                    />
                    Auto-play voice for me
                  </label>
                </div>

                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Write what ${activeSpeakerMeta.name} wants to say...`}
                />

                <div className="composer-actions">
                  <AudioControls onAudioReady={sendAudioMessage} disabled={busy} />
                  <button type="button" className="primary-cta" onClick={sendTextMessage} disabled={busy}>
                    {isSubmittingText ? "Sending..." : "Send message"}
                  </button>
                </div>

                {error ? <p className="error-banner">{error}</p> : null}
              </div>
            </section>
          </section>
        </main>
      )}
    </>
  );
}
