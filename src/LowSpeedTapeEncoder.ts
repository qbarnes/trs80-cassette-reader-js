
import {concatAudio} from "./AudioUtils";

/**
 * Generate one pulse for 500 baud audio.
 */
function generatePulse(length: number): Int16Array {
    const audio = new Int16Array(length);

    // Center it in the audio.
    for (let i = 0; i < length/2; i++) {
        const t = 2*Math.PI*i/(length/2);

        // -0.5 to 0.5, matches recorded audio.
        audio[i + length/4] = Math.sin(t)*16384;
    }

    return audio;
}

/**
 * Adds the byte "b" to the samples list, most significant bit first.
 * @param samplesList list of samples we're adding to.
 * @param b byte to generate.
 * @param cycle samples for a cycle.
 * @param silence samples for silence.
 */
function addByte(samplesList: Int16Array[], b: number, cycle: Int16Array, silence: Int16Array) {
    // MSb first.
    for (let i = 7; i >= 0; i--) {
        // Clock pulse.
        samplesList.push(cycle);

        // Data pulse.
        const bit = (b & (1 << i)) != 0;
        samplesList.push(bit ? cycle : silence);
    }
}

/**
 * Encode the sequence of bytes as an array of audio samples for low-speed (500 baud) cassettes.
 * @param bytes cas-style array of bytes, including 256 zero bytes, sync byte, and trailing zero bytes.
 * @param sampleRate number of samples per second in the generated audio.
 */
export function encodeLowSpeed(bytes: Uint8Array, sampleRate: number): Int16Array {
    // Length of one cycle, in samples. They're all 1ms.
    const CYCLE_LENGTH = Math.round(0.001*sampleRate);

    // Samples representing one cycle.
    const cycle = generatePulse(CYCLE_LENGTH);

    // Samples representing 1ms of silence.
    const silence = new Int16Array(CYCLE_LENGTH);

    // List of samples.
    const samplesList: Int16Array[] = [];

    // Start with half a second of silence.
    samplesList.push(new Int16Array(sampleRate / 2));

    // All data bytes.
    for (let i = 0; i < bytes.length; i++) {
        addByte(samplesList, bytes[i], cycle, silence);
    }

    // End with half a second of silence.
    samplesList.push(new Int16Array(sampleRate / 2));

    // Concatenate all samples.
    return concatAudio(samplesList);
}