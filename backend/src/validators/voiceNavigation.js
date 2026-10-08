export function voiceError(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

export function validateVoiceRequest(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.destinations) ||
      input.destinations.length < 1 || input.destinations.length > 200) throw voiceError("INVALID_VOICE_DESTINATIONS");
  const seen = new Set();
  let total = 0;
  const destinations = input.destinations.map((entry, index) => {
    if (!entry || !/^d\d{1,4}$/.test(entry.id) || seen.has(entry.id) || typeof entry.label !== "string" ||
        !entry.label.trim() || entry.label.length > 400 || entry.number !== index + 1) throw voiceError("INVALID_VOICE_DESTINATIONS");
    seen.add(entry.id); total += entry.label.length;
    // Only labels, ordinals and opaque IDs cross the boundary; discard all other fields.
    return { id: entry.id, number: index + 1, label: entry.label.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f]/g, " ").trim() };
  });
  if (total > 40000) throw voiceError("VOICE_DESTINATIONS_TOO_LARGE");
  if (input.mimeType !== "audio/wav" || typeof input.audioBase64 !== "string" ||
      input.audioBase64.length > 900000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.audioBase64)) throw voiceError("INVALID_VOICE_AUDIO");
  const audio = Buffer.from(input.audioBase64, "base64");
  // Capture emits canonical mono, 16 kHz, signed 16-bit PCM WAV. Validate duration from bytes,
  // never from a caller-supplied duration. Maximum recording length is ten seconds.
  if (audio.length < 6444 || audio.length > 320044 || audio.toString("ascii", 0, 4) !== "RIFF" ||
      audio.toString("ascii", 8, 12) !== "WAVE" || audio.toString("ascii", 12, 16) !== "fmt " ||
      audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 ||
      audio.readUInt32LE(24) !== 16000 || audio.readUInt32LE(28) !== 32000 || audio.readUInt16LE(32) !== 2 ||
      audio.readUInt16LE(34) !== 16 || audio.toString("ascii", 36, 40) !== "data" ||
      audio.readUInt32LE(40) !== audio.length - 44 || audio.readUInt32LE(4) !== audio.length - 8 || (audio.length - 44) % 2) {
    throw voiceError("INVALID_VOICE_AUDIO");
  }
  let energy = 0;
  for (let offset = 44; offset < audio.length; offset += 2) energy += (audio.readInt16LE(offset) / 32768) ** 2;
  return { audio, mimeType: "audio/wav", destinations, silent: Math.sqrt(energy / ((audio.length - 44) / 2)) < 0.002 };
}

export function validateVoiceVerdict(input, destinations) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).sort().join(",") !== "destination_id,result" || !["match", "no_match"].includes(input.result)) {
    throw voiceError("INVALID_VOICE_VERDICT", 502);
  }
  if (input.result === "match" ? !destinations.some(entry => entry.id === input.destination_id) : input.destination_id !== null) {
    throw voiceError("INVALID_VOICE_VERDICT", 502);
  }
  return { result: input.result, destination_id: input.destination_id };
}

export function negativeVoiceCommand(transcript) {
  return /(?:^|\s)(?:না|নয়|নয়|নেই|নাহ|বন্ধ|বাতিল)(?:\s|[।.!?,]|$)|\b(?:don't|do not|cancel|stop|never)\b/iu.test(transcript);
}
