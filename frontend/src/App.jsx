import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { AudioControls } from "./components/AudioControls";
import { AudioPlayer } from "./components/AudioPlayer";
import { CondomBurst } from "./components/CondomBurst";
import { HeroModel } from "./components/HeroModel";
import { LanguageSelect } from "./components/LanguageSelect";
import { RoomQrCode } from "./components/RoomQrCode";
import { ToggleSwitch } from "./components/ToggleSwitch";
import { VoiceStudio } from "./components/VoiceStudio";
import { GENDER_VALUES, LANGUAGE_VALUES } from "./i18n/resources";
import { resolveLocaleForLanguage, resolvePreferredLocale } from "./i18n/utils";
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

function createPendingMessage({ kind, speaker, source, target, originalText, translatedText, attachmentName = null }) {
  return {
    id: createLocalMessageId(),
    kind,
    speaker,
    speaker_name: source.name,
    target_name: target.name,
    source_language: source.language,
    target_language: target.language,
    original_text: originalText,
    translated_text: translatedText,
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
  const { t, i18n: i18nInstance } = useTranslation();
  const browserLocale = useMemo(() => resolvePreferredLocale(), []);
  const [preferredUiLanguage, setPreferredUiLanguage] = useState("auto");
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
  const [viewerRole, setViewerRole] = useState("a");
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
  const autoLocale = room
    ? resolveLocaleForLanguage(viewerRole === "b" ? room.participant_b.language : room.participant_a.language, browserLocale)
    : authUser
      ? resolveLocaleForLanguage(participants.a.language, browserLocale)
      : browserLocale;
  const locale = preferredUiLanguage === "auto"
    ? autoLocale
    : resolveLocaleForLanguage(preferredUiLanguage, browserLocale);

  function localizeLanguage(language) {
    return t(`languages.${language}`, { defaultValue: language });
  }

  function localizeGender(gender) {
    return t(`genders.${gender}`, { defaultValue: gender });
  }

  const interfaceLanguageOptions = useMemo(
    () => [
      { value: "auto", label: t("automaticRoomLanguage") },
      ...LANGUAGE_VALUES.map((value) => ({ value, label: localizeLanguage(value) })),
    ],
    [t, locale],
  );

  const languageOptions = useMemo(
    () => LANGUAGE_VALUES.map((value) => ({ value, label: localizeLanguage(value) })),
    [locale],
  );
  const genderOptions = useMemo(
    () => GENDER_VALUES.map((value) => ({ value, label: localizeGender(value) })),
    [locale],
  );

  useEffect(() => {
    const storedUiLanguage = window.localStorage.getItem("smash_translator_ui_language");
    if (storedUiLanguage) {
      setPreferredUiLanguage(storedUiLanguage);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("smash_translator_ui_language", preferredUiLanguage);
  }, [preferredUiLanguage]);

  useEffect(() => {
    if (i18nInstance.resolvedLanguage !== locale) {
      void i18nInstance.changeLanguage(locale);
    }
  }, [i18nInstance, locale]);

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
          setViewerRole(role);
        } else {
          setViewerRole("a");
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
      setViewerRole("a");
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
      setError(t("createRoomFirst"));
      return;
    }
    if (!draft.trim()) {
      setError(t("writeMessageBeforeSending"));
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
      translatedText: t("translatingMessage"),
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
                      translated_text: t("translationFailed"),
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
      setError(t("createRoomFirst"));
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
      originalText: t("transcribingVoiceMessage"),
      translatedText: t("translatingMessage"),
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
                      translated_text: t("translationFailed"),
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
    const statusLabel = message.status === "translating" ? t("translating") : message.status;

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
                {t("languagePair", {
                  source: localizeLanguage(speaker.language),
                  target: localizeLanguage(target.language),
                })}
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
              <span className="copy-label">{t("original")}</span>
              <p>{message.original_text}</p>
            </div>
            <div className="copy-block copy-block--accent">
              <span className="copy-label">{t("translated")}</span>
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
            <div className="eyebrow">{t("bootIdentity")}</div>
            <h1>{t("connectingPassport")}</h1>
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
            <div className="eyebrow">{t("preparingRoom")}</div>
            <h1>{t("openingRoom")}</h1>
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
              <div className="eyebrow">{t("profile")}</div>
              <h2>{authUser.display_name || authUser.email}</h2>
              <p>{t("manageVoice")}</p>
            </div>
            <div className="header-actions">
              <button type="button" className="secondary" onClick={() => setShowProfile(false)}>
                {t("back")}
              </button>
              <button type="button" className="secondary" onClick={signOut}>
                {t("signOut")}
              </button>
            </div>
          </header>

          <section className="setup-card setup-card--allow-overflow">
            <LanguageSelect
              label={t("interfaceLanguage")}
              value={preferredUiLanguage}
              onChange={setPreferredUiLanguage}
              options={interfaceLanguageOptions}
            />
          </section>

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
              <div className="eyebrow">{t("room")} {room.id}</div>
            </div>
            {canManageRooms ? (
              <div className="header-actions room-header__actions">
                <button type="button" className="secondary" onClick={copyRoomLink}>
                  {t("copyHostLink")}
                </button>
                <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(partnerInviteLink).catch(() => {})}>
                  {t("copyInviteLink")}
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
                  {t("leaveRoom")}
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
                  {t("newRoom")}
                </button>
              </div>
            ) : null}
          </header>

          <section className="chat-layout">
            <aside className="participants-panel">
              <div className="share-card">
                <span className="field-label">{t("invitePartner")}</span>
                <RoomQrCode value={partnerInviteLink} />
                <a className="room-link" href={partnerInviteLink}>
                  {partnerInviteLink}
                </a>
              </div>

              <div className="speaker-card speaker-card--summary">
                <span className="speaker-tag">{t("participants")}</span>
                <div className="speaker-summary-row">
                  <strong>{room.participant_a.name}</strong>
                  <span>{localizeLanguage(room.participant_a.language)}</span>
                </div>
                <div className="speaker-summary-row">
                  <strong>{room.participant_b.name}</strong>
                  <span>{localizeLanguage(room.participant_b.language)}</span>
                </div>
              </div>

              {canManageRooms ? (
                <div className="mode-card">
                  <span className="field-label">{t("roomAudio")}</span>
                  <ToggleSwitch
                    label={t("voiceRepliesInRoom")}
                    checked={synthesizeResponses}
                    onChange={(value) => void syncRoomPreferences(mode, value)}
                  />
                </div>
              ) : null}
            </aside>

            <section className="conversation-panel">
              <div className="messages-stream" ref={messagesStreamRef}>
                {room.messages.length ? (
                  room.messages.map(renderMessage)
                ) : (
                  <div className="timeline-note">
                    <span>{t("roomReady")}</span>
                  </div>
                )}
                <div ref={streamEndRef} />
              </div>

              <div className="composer-card">
                <div className="composer-topline">
                  <div className="composer-speaker-meta">
                    <span className="field-label">{t("activeSpeaker")}</span>
                    <div className="composer-speaker-row">
                      <strong>
                        {t("speakingAs", {
                          name: activeSpeakerMeta.name,
                          language: localizeLanguage(activeSpeakerMeta.language),
                        })}
                      </strong>
                      <button
                        type="button"
                        className={`composer-switch-button${isSwitchAnimating ? " composer-switch-button--animating" : ""}`}
                        onClick={handleSpeakerSwitch}
                        aria-label={t("switchActiveSpeaker")}
                        title={t("switchActiveSpeaker")}
                      >
                        <img
                          src="/assets/switch-card.png"
                          alt=""
                          className="composer-switch-image"
                        />
                      </button>
                    </div>
                  </div>
                  <ToggleSwitch
                    label={t("autoPlayVoiceForMe")}
                    checked={autoPlayVoice}
                    onChange={setAutoPlayVoice}
                    disabled={!synthesizeResponses}
                  />
                </div>

                <div className="composer-inputbar">
                  <input
                    className="composer-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleDraftKeyDown}
                    placeholder={t("writeWhatSays", { name: activeSpeakerMeta.name })}
                  />
                  {draft.trim() ? (
                    <button type="button" className="composer-send-button" onClick={sendTextMessage} disabled={busy}>
                      {isSubmittingText ? "..." : t("send")}
                    </button>
                  ) : (
                    <AudioControls
                      onAudioReady={sendAudioMessage}
                      disabled={busy}
                      iconOnly
                      labels={{
                        recordVoice: t("recordVoice"),
                        stopRecording: t("stopVoiceRecording"),
                        microphoneDenied: t("microphoneDenied"),
                      }}
                    />
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
              <div className="eyebrow">{t("createRoom")}</div>
              <h2>{t("setupConversation")}</h2>
              <p>{t("setupConversationBody")}</p>
            </div>
            <div className="header-actions room-setup-header__actions">
              <button type="button" className="secondary" onClick={() => setShowProfile(true)}>
                {t("profile")}
              </button>
            </div>
          </header>

          <section className="setup-card setup-card--allow-overflow">
            <div className="setup-grid">
              <div className="identity-card">
                <span className="identity-kicker">{t("speakerA")}</span>
                <input
                  className="name-input"
                  value={participants.a.name}
                  onChange={(event) => updateParticipant("a", "name", event.target.value)}
                  placeholder={t("yourName")}
                />
                <LanguageSelect
                  label={t("language")}
                  value={participants.a.language}
                  onChange={(value) => updateParticipant("a", "language", value)}
                  options={languageOptions}
                />
                <LanguageSelect
                  label={t("gender")}
                  value={participants.a.gender}
                  onChange={(value) => updateParticipant("a", "gender", value)}
                  options={genderOptions}
                />
              </div>

              <div className="identity-card identity-card--contrast">
                <span className="identity-kicker">{t("speakerB")}</span>
                <input
                  className="name-input"
                  value={participants.b.name}
                  onChange={(event) => updateParticipant("b", "name", event.target.value)}
                  placeholder={t("partnerName")}
                />
                <LanguageSelect
                  label={t("language")}
                  value={participants.b.language}
                  onChange={(value) => updateParticipant("b", "language", value)}
                  options={languageOptions}
                />
                <LanguageSelect
                  label={t("gender")}
                  value={participants.b.gender}
                  onChange={(value) => updateParticipant("b", "gender", value)}
                  options={genderOptions}
                />
              </div>
            </div>

            <div className="setup-controls">
              <div className="toggle-stack">
                <ToggleSwitch
                  label={t("generateSpokenReplies")}
                  checked={synthesizeResponses}
                  onChange={setSynthesizeResponses}
                />
                <ToggleSwitch
                  label={t("autoPlayTranslatedAudio")}
                  checked={autoPlayVoice}
                  onChange={setAutoPlayVoice}
                  disabled={!synthesizeResponses}
                />
              </div>
            </div>

            <button type="button" className="primary-cta room-setup-cta" onClick={handleCreateRoom} disabled={isCreatingRoom}>
              {isCreatingRoom ? t("creatingRoom") : t("createRoom")}
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

          <section className="setup-card setup-card--allow-overflow auth-card">
            <LanguageSelect
              label={t("interfaceLanguage")}
              value={preferredUiLanguage}
              onChange={setPreferredUiLanguage}
              options={interfaceLanguageOptions}
            />

            {authMode === "register" ? (
              <label className="field">
                <span>{t("displayName")}</span>
                <input
                  value={authForm.display_name}
                  onChange={(event) => setAuthForm((current) => ({ ...current, display_name: event.target.value }))}
                  placeholder={t("yourPublicName")}
                />
              </label>
            ) : null}

            <label className="field">
              <span>{t("email")}</span>
              <input
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="you@example.com"
              />
            </label>

            <label className="field">
              <span>{t("password")}</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={t("minimumPassword")}
              />
            </label>

            <button type="button" className="primary-cta" onClick={submitAuth}>
              {authMode === "login" ? t("signIn") : t("createAccount")}
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
            >
              {authMode === "login" ? t("needAccount") : t("alreadyHaveAccount")}
            </button>

            {error ? <p className="error-banner">{error}</p> : null}
          </section>
        </main>
      )}
    </>
  );
}
