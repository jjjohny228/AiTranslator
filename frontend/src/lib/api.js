const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

function withAuth(headers = {}, token) {
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

async function parseResponse(response) {
  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        message = data.detail.map((item) => item.msg ?? JSON.stringify(item)).join(", ");
      } else if (data.detail) {
        message = JSON.stringify(data.detail);
      }
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return response.json();
}

export async function translateText(payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/translate/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function translateAudio(formData) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/translate/audio`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export function base64ToAudioUrl(base64, mimeType) {
  if (!base64 || !mimeType) {
    return null;
  }
  return `data:${mimeType};base64,${base64}`;
}

export async function createRoom(payload) {
  const token = payload.token;
  const body = { ...payload };
  delete body.token;
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/rooms`, {
      method: "POST",
      headers: {
        ...withAuth({}, token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function fetchRoom(roomId) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/rooms/${roomId}`);
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function updateRoomPreferences(roomId, payload) {
  let response;
  try {
    const formData = new FormData();
    formData.append("mode", payload.mode);
    formData.append("synthesize_responses", String(payload.synthesize_responses));
    response = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
      method: "PATCH",
      body: formData,
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function register(payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function login(payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function fetchMe(token) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: withAuth({}, token),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function updateMe(token, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: "PATCH",
      headers: {
        ...withAuth({}, token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function fetchVoiceProfile(token) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/profile/voice`, {
      headers: withAuth({}, token),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function fetchVoiceScript(language, token) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/profile/voice-script?language=${encodeURIComponent(language)}`, {
      headers: withAuth({}, token),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function createVoiceProfile({ token, language, gender, files }) {
  let response;
  try {
    const formData = new FormData();
    formData.append("language", language);
    formData.append("gender", gender);
    files.forEach((file) => formData.append("files", file));
    response = await fetch(`${API_BASE_URL}/profile/voice`, {
      method: "POST",
      headers: withAuth({}, token),
      body: formData,
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function sendRoomTextMessage(roomId, payload, token) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/text`, {
      method: "POST",
      headers: {
        ...withAuth({}, token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}

export async function sendRoomAudioMessage(roomId, speaker, file, token) {
  let response;
  try {
    const formData = new FormData();
    formData.append("speaker", speaker);
    formData.append("file", file);
    response = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/audio`, {
      method: "POST",
      headers: withAuth({}, token),
      body: formData,
    });
  } catch {
    throw new Error("Cannot reach the backend API. Start FastAPI on port 8000 or set VITE_API_BASE_URL.");
  }
  return parseResponse(response);
}
