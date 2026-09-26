// Clean Audio conversion utilities for Gemini Real-Time Voice

// Convert Float32 buffer of any sampleRate to 16000Hz 16-bit PCM little-endian
export function resampleTo16kPCM(
  inputData: Float32Array,
  inputSampleRate: number
): ArrayBuffer {
  const targetSampleRate = 16000;
  if (inputSampleRate === targetSampleRate) {
    const buffer = new ArrayBuffer(inputData.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  // Linear interpolation downsampler / upsampler to exact 16000Hz
  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(inputData.length / ratio);
  const buffer = new ArrayBuffer(newLength * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < newLength; i++) {
    const originalPos = i * ratio;
    const index = Math.floor(originalPos);
    const decimal = originalPos - index;

    const sample1 = inputData[index] || 0;
    const sample2 = inputData[index + 1] !== undefined ? inputData[index + 1] : sample1;
    const interpolated = sample1 + (sample2 - sample1) * decimal;

    const s = Math.max(-1, Math.min(1, interpolated));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Decodes raw 16-bit PCM at 24000 Hz or WAV header into an AudioBuffer
export async function decodeAudioData(
  audioCtx: AudioContext,
  base64: string,
  sampleRate = 24000
): Promise<AudioBuffer> {
  const arrayBuffer = base64ToArrayBuffer(base64);

  // Check if it's a RIFF/WAV container
  const header = new Uint8Array(arrayBuffer.slice(0, 4));
  const isRiff =
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46;

  if (isRiff) {
    try {
      return await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch (e) {
      console.warn('Native decodeAudioData fallback:', e);
    }
  }

  // Treat as raw 16-bit mono PCM Linear at 24kHz
  const int16Array = new Int16Array(arrayBuffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768;
  }

  const audioBuffer = audioCtx.createBuffer(1, float32Array.length, sampleRate);
  audioBuffer.copyToChannel(float32Array, 0);
  return audioBuffer;
}
