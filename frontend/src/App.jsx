import { useEffect, useMemo, useRef, useState } from "react";
import { AudioControls } from "./components/AudioControls";
import { AudioPlayer } from "./components/AudioPlayer";
import { CondomBurst } from "./components/CondomBurst";
import { HeroModel } from "./components/HeroModel";
import { LanguageSelect } from "./components/LanguageSelect";
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

const LOCAL_MESSAGE_PREFIX = "local-";

function createLocalMessageId() {
  if (window.crypto?.randomUUID) {
    return `${LOCAL_MESSAGE_PREFIX}${window.crypto.randomUUID()}`;
  }
  return `${LOCAL_MESSAGE_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createPendingMessage({ kind, speaker, source, target, originalText, attachmentName = null }) {
  return {
    id: createLocalMessageId(),
    kind,
    speaker,
    speaker_name: source.name,
    target_name: target.name,
    source_language: source.language,
    target_language: target.language,
    original_text: originalText,
    translated_text: "Translating...",
    detected_source_language: source.language,
    status: "translating",
    audio_base64: null,
    audio_mime_type: null,
    audioUrl: null,
    attachment_name: attachmentName,
    created_at: Date.now() / 1000,
    error_detail: null,
  };
}

function isLocalMessage(message) {
  return String(message.id).startsWith(LOCAL_MESSAGE_PREFIX);
}

function matchesPendingMessage(serverMessage, pendingMessage) {
  return (
    serverMessage.speaker === pendingMessage.speaker &&
    serverMessage.kind === pendingMessage.kind &&
    serverMessage.original_text === pendingMessage.original_text &&
    serverMessage.source_language === pendingMessage.source_language &&
    serverMessage.target_language === pendingMessage.target_language &&
    Math.abs((serverMessage.created_at ?? 0) - (pendingMessage.created_at ?? 0)) < 45
  );
}

function mergeRoomStateWithPending(currentRoom, latestRoom) {
  if (!currentRoom) {
    return latestRoom;
  }
  const pendingMessages = currentRoom.messages.filter(isLocalMessage);
  if (!pendingMessages.length) {
    return latestRoom;
  }
  const unresolvedPending = pendingMessages.filter(
    (pendingMessage) => !latestRoom.messages.some((serverMessage) => matchesPendingMessage(serverMessage, pendingMessage)),
  );
  if (!unresolvedPending.length) {
    return latestRoom;
  }
  return {
    ...latestRoom,
    messages: [...latestRoom.messages, ...unresolvedPending],
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
  const [isSwitchAnimating, setIsSwitchAnimating] = useState(false);
  const messagesStreamRef = useRef(null);
  const streamEndRef = useRef(null);
  const switchAnimationTimeoutRef = useRef(null);

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
    return () => {
      if (switchAnimationTimeoutRef.current) {
        window.clearTimeout(switchAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!room?.messages.length) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const container = messagesStreamRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [room?.id, room?.messages]);

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
        setRoom((current) => mergeRoomStateWithPending(current, normalizeRoom(latestRoom)));
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
        token: authToken,
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
    if (!draft.trim()) {
      setError("Write a message before sending.");
      return;
    }

    setIsSubmittingText(true);
    setError("");
    const text = draft.trim();
    const { source, target } = getSpeakerData(activeSpeaker);
    const pendingMessage = createPendingMessage({
      kind: "text",
      speaker: activeSpeaker,
      source,
      target,
      originalText: text,
    });
    setDraft("");
    setRoom((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, pendingMessage],
          }
        : current,
    );
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
              messages: current.messages.some((message) => message.id === nextMessage.id)
                ? current.messages
                : [...current.messages.filter((message) => message.id !== pendingMessage.id), nextMessage],
            }
          : current,
      );
      if (synthesizeResponses && autoPlayVoice && nextMessage.audioUrl) {
        const audio = new Audio(nextMessage.audioUrl);
        void audio.play().catch(() => {});
      }
    } catch (requestError) {
      console.error("Room text send failed", requestError);
      setRoom((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.id === pendingMessage.id
                  ? {
                      ...message,
                      status: "error",
                      translated_text: "Translation failed.",
                      error_detail: requestError.message,
                    }
                  : message,
              ),
            }
          : current,
      );
      setError(requestError.message);
    } finally {
      setIsSubmittingText(false);
    }
  }

  function handleDraftKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!busy && draft.trim()) {
        void sendTextMessage();
      }
    }
  }

  function handleSpeakerSwitch() {
    setActiveSpeaker((current) => (current === "a" ? "b" : "a"));
    setIsSwitchAnimating(true);
    if (switchAnimationTimeoutRef.current) {
      window.clearTimeout(switchAnimationTimeoutRef.current);
    }
    switchAnimationTimeoutRef.current = window.setTimeout(() => {
      setIsSwitchAnimating(false);
      switchAnimationTimeoutRef.current = null;
    }, 700);
  }

  async function sendAudioMessage(file) {
    if (!room?.id) {
      setError("Create a room first.");
      return;
    }
    setIsSubmittingAudio(true);
    setError("");
    const { source, target } = getSpeakerData(activeSpeaker);
    const pendingMessage = createPendingMessage({
      kind: "audio",
      speaker: activeSpeaker,
      source,
      target,
      originalText: "Transcribing voice message...",
      attachmentName: file.name || "Voice note",
    });
    setRoom((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, pendingMessage],
          }
        : current,
    );
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
              messages: current.messages.some((message) => message.id === nextMessage.id)
                ? current.messages
                : [...current.messages.filter((message) => message.id !== pendingMessage.id), nextMessage],
            }
          : current,
      );
      if (synthesizeResponses && autoPlayVoice && nextMessage.audioUrl) {
        const audio = new Audio(nextMessage.audioUrl);
        void audio.play().catch(() => {});
      }
    } catch (requestError) {
      console.error("Room audio send failed", requestError);
      setRoom((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.id === pendingMessage.id
                  ? {
                      ...message,
                      status: "error",
                      translated_text: "Translation failed.",
                      error_detail: requestError.message,
                    }
                  : message,
              ),
            }
          : current,
      );
      setError(requestError.message);
    } finally {
      setIsSubmittingAudio(false);
    }
  }

  function renderMessage(message) {
    const speaker = message.speaker === "a" ? room.participant_a : room.participant_b;
    const target = message.speaker === "a" ? room.participant_b : room.participant_a;

    const statusLabel = message.status === "translating" ? "Translating" : message.status;

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
              <span className={`status-pill status-pill--${message.status}`}>
                {message.status === "translating" ? <span className="status-spinner" aria-hidden="true" /> : null}
                {statusLabel}
              </span>
            ) : null}
          </div>

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

          {message.audioUrl ? <AudioPlayer src={message.audioUrl} /> : null}
        </div>
      </article>
    );
  }

  const busy = isSubmittingText || isSubmittingAudio || isUpdatingRoom;
  const activeSpeakerMeta = getSpeakerData(activeSpeaker).source;
  const canManageRooms = Boolean(authUser);

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

  if (showProfile) {
    return (
      <>
        <CondomBurst />
        <main className="setup-shell">
          <header className="chat-header">
            <div>
              <div className="eyebrow">Profile</div>
              <h2>{authUser.display_name || authUser.email}</h2>
              <p>Manage your custom voice and translated speech settings.</p>
            </div>
            <div className="header-actions">
              <button type="button" className="secondary" onClick={() => setShowProfile(false)}>
                Back
              </button>
              <button type="button" className="secondary" onClick={signOut}>
                Sign out
              </button>
            </div>
          </header>

          <VoiceStudio
            token={authToken}
            user={authUser}
            voiceProfile={voiceProfile}
            onProfileUpdated={setVoiceProfile}
            languageOptions={languageOptions}
            genderOptions={genderOptions}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <CondomBurst />
      {room ? (
        <main className="chat-shell chat-shell--room">
          <header className="chat-header room-header">
            <div className="room-header__meta">
              <div className="eyebrow">Room {room.id}</div>
            </div>
            {canManageRooms ? (
              <div className="header-actions room-header__actions">
                <button type="button" className="secondary" onClick={copyRoomLink}>
                  Copy host link
                </button>
                <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(partnerInviteLink).catch(() => {})}>
                  Copy invite link
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    window.history.replaceState({}, "", window.location.pathname);
                    setRoom(null);
                    setError("");
                  }}
                >
                  Leave room
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
              </div>
            ) : null}
          </header>

          <section className="chat-layout">
            <aside className="participants-panel">
              <div className="share-card">
                <span className="field-label">Invite partner</span>
                <RoomQrCode value={partnerInviteLink} />
                <a className="room-link" href={partnerInviteLink}>
                  {partnerInviteLink}
                </a>
              </div>

              <div className="speaker-card speaker-card--summary">
                <span className="speaker-tag">Participants</span>
                <div className="speaker-summary-row">
                  <strong>{room.participant_a.name}</strong>
                  <span>{room.participant_a.language}</span>
                </div>
                <div className="speaker-summary-row">
                  <strong>{room.participant_b.name}</strong>
                  <span>{room.participant_b.language}</span>
                </div>
              </div>

              <div className="mode-card">
                <span className="field-label">Room audio</span>
                <label className="checkbox checkbox--inline">
                  <input
                    type="checkbox"
                    checked={synthesizeResponses}
                    onChange={(event) => void syncRoomPreferences(mode, event.target.checked)}
                    disabled={!canManageRooms}
                  />
                  Voice replies in this room
                </label>
              </div>
            </aside>

            <section className="conversation-panel">
              <div className="messages-stream" ref={messagesStreamRef}>
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
                  <div className="composer-speaker-meta">
                    <span className="field-label">Active speaker</span>
                    <div className="composer-speaker-row">
                      <strong>
                        {activeSpeakerMeta.name} speaking {activeSpeakerMeta.language}
                      </strong>
                      <button
                        type="button"
                        className={`composer-switch-button${isSwitchAnimating ? " composer-switch-button--animating" : ""}`}
                        onClick={handleSpeakerSwitch}
                        aria-label="Switch active speaker"
                        title="Switch active speaker"
                      >
                        <img
                          src="/assets/switch-card.png"
                          alt=""
                          className="composer-switch-image"
                        />
                      </button>
                    </div>
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

                <div className="composer-inputbar">
                  <input
                    className="composer-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleDraftKeyDown}
                    placeholder={`Write what ${activeSpeakerMeta.name} wants to say...`}
                  />
                  {draft.trim() ? (
                    <button type="button" className="composer-send-button" onClick={sendTextMessage} disabled={busy}>
                      {isSubmittingText ? "..." : "Send"}
                    </button>
                  ) : (
                    <AudioControls onAudioReady={sendAudioMessage} disabled={busy} iconOnly />
                  )}
                </div>

                {error ? <p className="error-banner">{error}</p> : null}
              </div>
            </section>
          </section>
        </main>
      ) : authUser ? (
        <main className="setup-shell">
          <header className="chat-header room-setup-header">
            <div className="room-setup-header__copy">
              <div className="eyebrow">Create room</div>
              <h2>Set up your conversation</h2>
              <p>Choose both speakers, languages, and audio behavior before you start.</p>
            </div>
            <div className="header-actions room-setup-header__actions">
              <button type="button" className="secondary" onClick={() => setShowProfile(true)}>
                Profile
              </button>
            </div>
          </header>

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

            <button type="button" className="primary-cta room-setup-cta" onClick={handleCreateRoom} disabled={isCreatingRoom}>
              {isCreatingRoom ? "Creating room..." : "Create room"}
            </button>

            {error ? <p className="error-banner">{error}</p> : null}
          </section>
        </main>
      ) : (
        <main className="setup-shell">
          <section className="setup-hero setup-hero--centered">
            <div className="hero-brand">
              <div className="hero-brand__title">SMASH</div>
              <div className="hero-brand__subtitle">TRANSLATOR</div>
            </div>
            <HeroModel />
          </section>

          <section className="setup-card auth-card">
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
      )}
    </>
  );
}
