// Concept — notification tones.
// One list used by the app (to play and preview tones) and by native-setup.js (to make the
// sound files inside the iPhone and Android apps). Each note: [frequency, start s, length s, wave, volume, slide-to frequency]
(function (root) {
  const TONES = [
    { id: "note",   name: "Note",   notes: [[880, 0, .16, "sine", 1], [1318.5, .11, .32, "sine", .9]] },
    { id: "chime",  name: "Chime",  notes: [[1318.5, 0, .5, "triangle", .8], [1661.2, .1, .5, "triangle", .7], [1975.5, .2, .7, "triangle", .7]] },
    { id: "pop",    name: "Pop",    notes: [[420, 0, .12, "sine", 1, 980], [1200, .1, .09, "sine", .5]] },
    { id: "bell",   name: "Bell",   notes: [[1046.5, 0, 1.2, "sine", 1], [2093, 0, .7, "sine", .35], [3139.5, 0, .35, "sine", .15]] },
    { id: "glass",  name: "Glass",  notes: [[1568, 0, .8, "sine", .8], [2349.3, .06, .9, "sine", .6]] },
    { id: "pulse",  name: "Pulse",  notes: [[740, 0, .07, "square", .35], [740, .13, .07, "square", .35], [987.8, .26, .14, "square", .35]] },
    { id: "bamboo", name: "Bamboo", notes: [[523.3, 0, .14, "triangle", 1], [784, .12, .18, "triangle", .9]] },
    { id: "ripple", name: "Ripple", notes: [[1318.5, 0, .14, "sine", .8], [1046.5, .08, .14, "sine", .8], [880, .16, .14, "sine", .8], [784, .24, .3, "sine", .8]] },
    { id: "bright", name: "Bright", notes: [[1046.5, 0, .1, "triangle", .8], [1318.5, .08, .1, "triangle", .8], [1568, .16, .1, "triangle", .8], [2093, .24, .35, "triangle", .8]] },
  ];

  // Turns a tone into sound samples (used to make the .wav files).
  function render(tone, rate) {
    rate = rate || 44100;
    const end = Math.max(...tone.notes.map(n => n[1] + n[2])) + 0.05;
    const out = new Float32Array(Math.ceil(end * rate));
    for (const [f, start, len, wave, vol, f2] of tone.notes) {
      const s0 = Math.floor(start * rate), n = Math.floor(len * rate);
      let ph = 0;
      for (let i = 0; i < n && s0 + i < out.length; i++) {
        const t = i / rate, p = i / n;
        const fr = f2 ? f * Math.pow(f2 / f, Math.min(1, p * 1.6)) : f;
        ph += 2 * Math.PI * fr / rate;
        const x = Math.sin(ph);
        const y = wave === "square" ? Math.sign(x) * 0.6 : wave === "triangle" ? (2 / Math.PI) * Math.asin(x) : x;
        const env = Math.min(1, t / 0.008) * Math.pow(0.0005, p);
        out[s0 + i] += y * vol * env;
      }
    }
    let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
    const k = peak ? 0.8 / peak : 1;
    for (let i = 0; i < out.length; i++) out[i] *= k;
    return out;
  }

  // 16-bit mono WAV file bytes.
  function wav(tone, rate) {
    rate = rate || 44100;
    const s = render(tone, rate), b = new ArrayBuffer(44 + s.length * 2), d = new DataView(b);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) d.setUint8(o + i, t.charCodeAt(i)); };
    str(0, "RIFF"); d.setUint32(4, 36 + s.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
    d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, rate, true);
    d.setUint32(28, rate * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); str(36, "data"); d.setUint32(40, s.length * 2, true);
    for (let i = 0; i < s.length; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s[i])) * 32767, true);
    return new Uint8Array(b);
  }

  const api = { TONES, render, wav };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CONCEPT_TONES = api;
})(typeof window !== "undefined" ? window : globalThis);
