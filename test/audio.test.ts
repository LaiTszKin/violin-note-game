// REQ-audio-1：音高頻率（12 平均律）＋播放器 mute 行為。
import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  createNotePlayer,
  frequencyOf,
  type AudioContextLike,
  type OscillatorLike,
} from "../src/lib/audio";
import type { NoteId } from "../src/lib/notes";

// 獨立 oracle：MIDI 表＋公式（唔引用 src 之常數）
const MIDI: Record<string, number> = {
  G3: 55,
  A3: 57,
  B3: 59,
  C4: 60,
  D4: 62,
  E4: 64,
  F4: 65,
  G4: 67,
  A4: 69,
  B4: 71,
  C5: 72,
  D5: 74,
  E5: 76,
  F5: 77,
  G5: 79,
  A5: 81,
  B5: 83,
};
const ALL_NOTES = Object.keys(MIDI) as NoteId[];
const expectedFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

test("PITCH_FREQUENCY_EXACT: frequencyOf＝440×2^((midi−69)/12)（±0.01Hz）且單調遞增", () => {
  for (const id of ALL_NOTES) {
    assert.ok(
      Math.abs(frequencyOf(id) - expectedFreq(MIDI[id])) <= 0.01,
      `${id}: ${frequencyOf(id)} vs ${expectedFreq(MIDI[id])}`,
    );
  }
  assert.equal(frequencyOf("A4"), 440, "A4 錨點");
  for (let i = 1; i < ALL_NOTES.length; i++) {
    assert.ok(
      frequencyOf(ALL_NOTES[i]) > frequencyOf(ALL_NOTES[i - 1]),
      `${ALL_NOTES[i - 1]} < ${ALL_NOTES[i]}`,
    );
  }
});

interface Log {
  oscFreqs: number[];
  started: number;
  stopped: number;
}

function makeFakeContext(log: Log): AudioContextLike {
  return {
    currentTime: 10,
    destination: {},
    state: "running",
    resume: () => Promise.resolve(),
    createOscillator(): OscillatorLike {
      const osc: OscillatorLike = {
        type: "",
        frequency: { value: 0 },
        connect: (d) => d,
        start: () => {
          log.oscFreqs.push(osc.frequency.value);
          log.started += 1;
        },
        stop: () => {
          log.stopped += 1;
        },
      };
      return osc;
    },
    createGain() {
      return { gain: { value: 0 }, connect: (d) => d };
    },
  };
}

test("PLAYER_MUTE_RESPECTED: play 以該音頻率起振（注入 fake context 觀測）；muted 時不起振", () => {
  fc.assert(
    fc.property(fc.constantFrom(...ALL_NOTES), (note) => {
      const log: Log = { oscFreqs: [], started: 0, stopped: 0 };
      const player = createNotePlayer({
        contextFactory: () => makeFakeContext(log),
      });
      assert.equal(player.isMuted(), false, "預設唔 mute");
      player.play(note);
      assert.equal(log.started, 1, "未 mute：應起振一次");
      assert.ok(
        Math.abs(log.oscFreqs[0] - expectedFreq(MIDI[note])) <= 0.01,
        `${note} 起振頻率：${log.oscFreqs[0]}`,
      );
      player.setMuted(true);
      assert.equal(player.isMuted(), true);
      player.play(note);
      assert.equal(log.started, 1, "muted：不得再起振");
      player.setMuted(false);
      assert.equal(player.isMuted(), false);
      player.play(note);
      assert.equal(log.started, 2, "解除 mute：可再起振");
    }),
    { numRuns: 50 },
  );
});
