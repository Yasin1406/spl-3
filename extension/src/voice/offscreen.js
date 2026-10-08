// The extension origin owns capture. No microphone permission is requested from publisher pages.
let current = null;
function release(session) {
  clearTimeout(session.timer);
  session.stream?.getTracks().forEach(track => track.stop());
}
async function wav(blob) {
  const context = new AudioContext();
  let decoded;
  try { decoded = await context.decodeAudioData(await blob.arrayBuffer()); }
  finally { await context.close(); }
  const length = Math.min(160000, Math.floor(decoded.duration * 16000));
  if (length < 3200) throw new Error("VOICE_TOO_SHORT");
  const offline = new OfflineAudioContext(1, length, 16000);
  const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  const bytes = new Uint8Array(44 + length * 2), view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0); });
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, length * 2, true);
  for (let index = 0; index < length; index++) view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767), true);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}
async function start(requestId) {
  if (current) return { error: "VOICE_BUSY" };
  const session = { requestId, cancelled: false, stream: null, timer: null, recorder: null };
  current = session;
  try {
    session.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (session.cancelled || current !== session) { release(session); return { error: "VOICE_CANCELLED" }; }
    const chunks = [];
    session.recorder = new MediaRecorder(session.stream, { mimeType: "audio/webm;codecs=opus" });
    session.recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    session.recorder.onerror = () => {
      session.cancelled = true; release(session); if (current === session) current = null;
      chrome.runtime.sendMessage({ type: "BAA_VOICE_CAPTURE_ERROR", requestId, error: "VOICE_RECORDING_FAILED" }).catch(() => {});
    };
    session.recorder.onstop = async () => {
      release(session);
      if (session.cancelled || current !== session) return;
      try {
        chrome.runtime.sendMessage({ type: "BAA_VOICE_CAPTURE_PROCESSING", requestId }).catch(() => {});
        const audioBase64 = await wav(new Blob(chunks, { type: "audio/webm" }));
        if (!session.cancelled && current === session) {
          await chrome.runtime.sendMessage({ type: "BAA_VOICE_CAPTURED", requestId, audioBase64, mimeType: "audio/wav" });
        }
      } catch (error) {
        if (!session.cancelled) chrome.runtime.sendMessage({ type: "BAA_VOICE_CAPTURE_ERROR", requestId,
          error: error.message === "VOICE_TOO_SHORT" ? "VOICE_TOO_SHORT" : "VOICE_RECORDING_FAILED" }).catch(() => {});
      } finally { if (current === session) current = null; }
    };
    session.recorder.start();
    session.timer = setTimeout(() => { if (session.recorder.state === "recording") session.recorder.stop(); }, 10000);
    return { recording: true };
  } catch (error) {
    release(session); if (current === session) current = null;
    return { error: ["NotAllowedError", "SecurityError"].includes(error.name) ? "MIC_PERMISSION_REQUIRED" : "MIC_UNAVAILABLE" };
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== "voice-offscreen" || sender.id !== chrome.runtime.id) return;
  if (message.type === "BAA_CAPTURE_START") { start(message.requestId).then(respond); return true; }
  if (!current || current.requestId !== message.requestId) { respond({ cancelled: true }); return; }
  if (message.type === "BAA_CAPTURE_CANCEL") {
    const session = current; session.cancelled = true; release(session);
    if (session.recorder?.state === "recording") session.recorder.stop();
    current = null; respond({ cancelled: true });
  } else if (message.type === "BAA_CAPTURE_STOP") {
    if (current.recorder?.state === "recording") current.recorder.stop();
    respond({ processing: true });
  }
});
