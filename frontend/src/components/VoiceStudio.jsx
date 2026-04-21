import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createVoiceProfile, fetchVoiceScript } from "../lib/api";
import { LanguageSelect } from "./LanguageSelect";

export function VoiceStudio({
  token,
  user,
  voiceProfile,
  onProfileUpdated,
  languageOptions,
  genderOptions,
}) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState(voiceProfile?.language ?? "English");
  const [gender, setGender] = useState(voiceProfile?.gender ?? "male");
  const [script, setScript] = useState(null);
  const [clips, setClips] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    async function loadScript() {
      try {
        const nextScript = await fetchVoiceScript(language, token);
        setScript(nextScript);
      } catch (requestError) {
        setError(requestError.message);
      }
    }
    void loadScript();
  }, [language, token]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const totalSeconds = clips.reduce((sum, clip) => sum + clip.seconds, 0);

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      streamRef.current = stream;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const file = new File([blob], `voice-sample-${Date.now()}.webm`, { type: "audio/webm" });
        setClips((current) => [...current, { id: `${Date.now()}`, file, seconds }]);
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch {
      setError(t("microphoneDenied"));
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  async function submitVoiceProfile() {
    if (!clips.length) {
      setError(t("recordOneSample"));
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const nextProfile = await createVoiceProfile({
        token,
        language,
        gender,
        files: clips.map((clip) => clip.file),
      });
      onProfileUpdated(nextProfile);
      setClips([]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="voice-studio">
      <div className="voice-studio__header">
        <div>
          <span className="field-label">{t("profileVoice")}</span>
          <h3>{user.display_name}</h3>
          <p>
            {voiceProfile?.status === "ready"
              ? t("customVoiceReady", { voiceName: voiceProfile.voice_name })
              : t("recordGuidedSamples")}
          </p>
        </div>
        <div className="voice-studio__status">
          {voiceProfile?.status === "ready" ? t("voiceReady") : t("noCustomVoice")}
        </div>
      </div>

      <div className="voice-studio__grid">
        <LanguageSelect label={t("scriptLanguage")} value={language} onChange={setLanguage} options={languageOptions} />
        <LanguageSelect label={t("voiceGender")} value={gender} onChange={setGender} options={genderOptions} />
      </div>

      <div className="voice-studio__instructions">
        <span className="field-label">{t("recordingGuide")}</span>
        <p>{script?.instructions ?? t("loadingScript")}</p>
        <strong>{t("recordedRecommended", { seconds: totalSeconds, recommended: script?.recommended_seconds ?? 120 })}</strong>
      </div>

      <div className="voice-script">
        {(script?.passages ?? []).map((passage, index) => (
          <article key={index} className="voice-script__item">
            <span className="copy-label">{t("passage", { index: index + 1 })}</span>
            <p>{passage}</p>
          </article>
        ))}
      </div>

      <div className="voice-studio__actions">
        {!isRecording ? (
          <button type="button" className="secondary" onClick={startRecording}>
            {t("recordSample")}
          </button>
        ) : (
          <button type="button" className="danger" onClick={stopRecording}>
            {t("stopRecording")}
          </button>
        )}
        <button type="button" className="primary-cta" onClick={submitVoiceProfile} disabled={isSubmitting}>
          {isSubmitting ? t("creatingVoice") : t("createCustomVoice")}
        </button>
      </div>

      {clips.length ? (
        <div className="voice-clips">
          {clips.map((clip) => (
            <div key={clip.id} className="voice-clips__item">
              <span>{t("sample")}</span>
              <strong>{clip.seconds}s</strong>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="error-banner">{error}</p> : null}
    </section>
  );
}
