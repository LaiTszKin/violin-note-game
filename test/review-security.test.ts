// 安全軸審計（PDD REVIEW C）：untrusted input（/play 之 URL searchParams）相關之安全不變式。
// 命題：SEC_PARSE_TOTAL（任意輸入不拋、輸出限於合法域）、SEC_NO_POLLUTION（不污染原型／常數）、
// SEC_TAINT_CONTAINED（敵意 query 之污染不得流出題庫與渲染域）、SEC_STATE_BOUNDED（會話狀態有界、
// 完成後吸收）、SEC_NO_DANGEROUS_SINK（src 無 raw-HTML／動態求值／命令／檔案／網路／儲存／env
// sink，亦無硬編碼憑證）、SEC_SINGLE_PARSE_POINT（不可信 query 之讀取面唯一且經已驗證入口）。
// 本檔只讀 src/（不改實作）；對應 .plan/28-09-2026/violin-note-game 安全軸 review。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";

import { STRING_ORDER, VALID_LEVELS, poolFor } from "../src/lib/levels";
import { PITCH_IDS, answerLine, type StringName } from "../src/lib/notes";
import { parsePlayQuery, type RawQuery } from "../src/lib/params";
import { ROUND_SIZE, createSession } from "../src/lib/session";
import { rngFromSeed } from "../src/lib/shuffle";

const LEGAL_MODES: readonly string[] = ["letter", "position"];
const LEGAL_LEVELS: readonly string[] = [...VALID_LEVELS];
const LEGAL_STRINGS: readonly string[] = [...STRING_ORDER];
const LEGAL_PITCHES: readonly string[] = [...PITCH_IDS];
/** 答案行合法域：「<A–G> ＝ <弦><空弦|n指>（ 或 …)」；n∈1–4。 */
const ANSWER_LINE =
  /^[A-G] ＝ [GDAE](?:空弦|弦[1-4]指)(?: 或 [GDAE](?:空弦|弦[1-4]指))?$/;

/** 敵意 query 之真實參數名：PBT 必須命中，否則不變式會被架空（vacuous）。 */
const ADVERSARIAL_KEYS: readonly string[] = [
  "mode",
  "level",
  "strings",
  "MODE",
  "Level",
  "  mode  ",
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "",
];

/** 任意值：字串／陣列／物件／非字串，含逗號切片與已知詞。 */
const hostileValue = () =>
  fc.oneof(
    fc.anything({ maxDepth: 1, maxKeys: 3 }),
    fc.string({ maxLength: 40 }),
    fc.array(fc.string({ maxLength: 20 }), { maxLength: 5 }),
    fc.string({ maxLength: 8 }).map((s) => `${s},`),
    fc.string({ maxLength: 8 }).map((s) => `${s},${s},G,D`),
    fc.constantFrom(
      "G",
      "D",
      "A",
      "E",
      "custom",
      "mixed",
      "letter",
      "position",
      "G,D",
      "a, D ,D,E,X",
      "",
      ",",
      ",,,",
      "../../etc/passwd",
      "<script>alert(1)</script>",
    ),
  );

/** 敵意 query 生成器：真實參數名（必中）＋任意鍵，值可為字串／陣列／物件／非字串。 */
const hostileQuery = () =>
  fc.oneof(
    fc.dictionary(fc.constantFrom(...ADVERSARIAL_KEYS), hostileValue(), {
      maxKeys: 8,
    }),
    fc.dictionary(
      fc.string({ maxLength: 12 }),
      fc.anything({ maxDepth: 1, maxKeys: 3 }),
      { maxKeys: 8 },
    ),
  );

/** 共用檢查：解析結果須落於合法域，且由之導出之題池非空、⊆ 17 個合法音高。 */
function assertParseContained(raw: unknown, label: string): void {
  const cfg = parsePlayQuery(raw as RawQuery);
  assert.ok(
    LEGAL_MODES.includes(cfg.mode),
    `${label}｜mode 越域：${String(cfg.mode)}`,
  );
  assert.ok(
    LEGAL_LEVELS.includes(cfg.level),
    `${label}｜level 越域：${String(cfg.level)}`,
  );
  assert.ok(
    cfg.strings.length <= LEGAL_STRINGS.length,
    `${label}｜strings 無界放大：${cfg.strings.length}`,
  );
  for (const s of cfg.strings)
    assert.ok(LEGAL_STRINGS.includes(s), `${label}｜弦越域：${String(s)}`);
  assert.deepEqual(
    [...cfg.strings],
    STRING_ORDER.filter((s) => cfg.strings.includes(s)),
    `${label}｜弦序＋去重`,
  );
  if (cfg.level === "custom")
    assert.ok(cfg.strings.length >= 1, `${label}｜custom 須有有效弦`);
  const pool = poolFor(cfg.level, cfg.strings);
  assert.ok(
    pool.length >= 1 && pool.length <= LEGAL_PITCHES.length,
    `${label}｜題池大小 ${pool.length}`,
  );
  for (const note of pool)
    assert.ok(
      LEGAL_PITCHES.includes(note),
      `${label}｜題池越域：${String(note)}`,
    );
}

/** src 下全部檔案（檔名排序，掃描結果可重現）。 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else out.push(path);
  }
  return out;
}

/** 危險 sink（injection／SSRF／檔案／儲存／secret 面）。 */
const SINKS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML/,
    "raw HTML sink",
  ],
  [/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/, "動態求值"],
  [/\bdocument\.write\b/, "DOM 覆寫 sink"],
  [
    /child_process|\bexec\s*\(|\bexecSync\b|\bexecFile\b|\bspawn\s*\(/,
    "命令執行",
  ],
  [
    /\bfs\.|node:fs|readFileSync|writeFileSync|createReadStream|createWriteStream|\bunlink\b/,
    "檔案系統",
  ],
  [
    /\bfetch\s*\(|XMLHttpRequest|\baxios\b|\bWebSocket\b|EventSource/,
    "對外網路（SSRF 面）",
  ],
  [
    /document\.cookie|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/,
    "瀏覽器儲存（token／PII 面）",
  ],
  [/\bprocess\.env\b/, "環境變數（secret 外洩面）"],
  [
    /\bjsonwebtoken\b|\bjwt\b|\bbcrypt\b|createCipheriv|createHmac/,
    "認證／密碼學面",
  ],
];

/** 硬編碼憑證形狀（確定性檢查，非 property）。 */
const SECRETS: ReadonlyArray<readonly [RegExp, string]> = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/sk-[A-Za-z0-9]{20,}/, "API key 形狀"],
  [/ghp_[A-Za-z0-9]{20,}/, "GitHub token 形狀"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "私鑰"],
  [
    /(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"']{8,}["']/i,
    "硬編碼憑證",
  ],
];

test("SEC_PARSE_TOTAL: 任意敵意 query 不拋例外、輸出限於合法域（injection 收斂）", () => {
  const samples: ReadonlyArray<readonly [unknown, string]> = [
    [{}, "空 query"],
    [
      {
        mode: "letter'; DROP TABLE notes;--",
        level: "../../etc/passwd",
        strings: "/etc/passwd",
      },
      "SQL／路徑穿越字樣",
    ],
    [
      {
        mode: "<script>alert(1)</script>",
        level: "custom",
        strings: "<img src=x onerror=alert(1)>",
      },
      "HTML 注入字樣（custom 無有效弦→mixed）",
    ],
    [{ level: "custom", strings: "a, D ,D,E,X" }, "小寫／空白／重複／垃圾"],
    [
      { mode: "position", level: "custom", strings: ["G,D,../../../etc", "E"] },
      "陣列＋逗號混合",
    ],
    [
      {
        mode: ["position", "drop"],
        level: ["custom", "../../"],
        strings: [["G"], ["D"]],
      },
      "巢狀陣列（非字串項）",
    ],
    [
      { level: "custom", strings: ",".repeat(100_000) },
      "逗號洪泛（輸出仍須有界）",
    ],
    [{ level: "custom", strings: `${"G".repeat(50_000)},D` }, "超長單值"],
    [{ strings: "\u0000\u001b[31mG\u0000" }, "NUL／ANSI escape"],
    [{ level: "😀", mode: "🙃", strings: "🎻,G" }, "非 BMP 字元"],
  ];
  for (const [raw, label] of samples) assertParseContained(raw, label);

  // 非物件輸入：真實呼叫者可以傳任何值。
  for (const weird of [
    undefined,
    null,
    "mode=position&level=G",
    42,
    true,
    [],
    Symbol("s"),
  ]) {
    assertParseContained(weird, `非物件輸入 ${String(weird)}`);
  }

  // 大型 payload 須即時完成（無 ReDoS／二次放大）。
  const started = Date.now();
  assertParseContained(
    { level: "custom", strings: "G,D,A,E,".repeat(40_000) },
    "大型 payload",
  );
  assert.ok(Date.now() - started < 5_000, "解析大型 payload 應即時完成");

  fc.assert(
    fc.property(hostileQuery(), (raw) => {
      assertParseContained(raw, "PBT 敵意 query");
    }),
    { numRuns: 300 },
  );
});

test("SEC_NO_POLLUTION: 敵意 query 不得污染 Object.prototype、不得改動模組常數", () => {
  const protoBefore = Object.getOwnPropertyNames(Object.prototype)
    .sort()
    .join(",");
  const orderBefore = [...STRING_ORDER];
  const levelsBefore = [...VALID_LEVELS];
  const pitchesBefore = [...PITCH_IDS];

  // (a) 自有 __proto__ 資料屬性（JSON.parse 產生）：不得被當成值來源。
  const evil = JSON.parse(
    '{"__proto__":{"mode":"position","level":"custom","strings":["G"]}}',
  ) as unknown;
  assert.deepEqual(
    parsePlayQuery(evil as RawQuery),
    { mode: "letter", level: "mixed", strings: [] },
    "自有 __proto__ 不得被解讀為參數",
  );

  // (b) Object.assign 會觸發 __proto__ setter ⇒ 值經原型鏈抵達；allowlist 仍須守住合法域。
  const inherited = Object.assign(
    {},
    JSON.parse(
      '{"__proto__":{"mode":"position","level":"custom","strings":["G"]}}',
    ),
  );
  assertParseContained(inherited, "原型鏈上之值");

  // (c) constructor／prototype 鍵。
  assertParseContained(
    JSON.parse('{"constructor":{"prototype":{"polluted":true}}}'),
    "constructor.prototype 鍵",
  );

  fc.assert(
    fc.property(hostileQuery(), (raw) => {
      parsePlayQuery(raw as RawQuery);
      assert.equal(
        ({} as Record<string, unknown>).polluted,
        undefined,
        "全域原型不得被污染",
      );
    }),
    { numRuns: 200 },
  );

  // 輸出不得別名（alias）模組常數：改動回傳值不得改動 src 常數。
  const cfg = parsePlayQuery({ level: "custom", strings: "G,D" });
  assert.deepEqual([...cfg.strings], ["G", "D"]);
  (cfg.strings as StringName[]).push("A");

  assert.equal(
    Object.getOwnPropertyNames(Object.prototype).sort().join(","),
    protoBefore,
    "Object.prototype 鍵集不變",
  );
  assert.deepEqual([...STRING_ORDER], orderBefore, "STRING_ORDER 不變");
  assert.deepEqual([...VALID_LEVELS], levelsBefore, "VALID_LEVELS 不變");
  assert.deepEqual([...PITCH_IDS], pitchesBefore, "PITCH_IDS 不變");
});

test("SEC_TAINT_CONTAINED / SEC_STATE_BOUNDED: 敵意 query → 會話 → 渲染域，全程守域、狀態有界、完成後吸收", () => {
  fc.assert(
    fc.property(
      hostileQuery(),
      fc.integer({ min: 0, max: 0x7fffffff }),
      fc.array(fc.boolean(), { maxLength: 40 }),
      (raw, seed, answers) => {
        const cfg = parsePlayQuery(raw as RawQuery);
        const session = createSession(
          poolFor(cfg.level, cfg.strings),
          rngFromSeed(seed),
        );
        for (const correct of answers) {
          const question = session.current();
          if (question === null) break;
          assert.ok(
            LEGAL_PITCHES.includes(question.noteId),
            `題目越域：${String(question.noteId)}`,
          );
          // 未作答前 current() 必須穩定（不得偷換題目）。
          assert.deepEqual(
            session.current(),
            question,
            "未作答前 current() 須穩定",
          );
          const line = answerLine(question.noteId);
          assert.match(line, ANSWER_LINE, `答案行越域：${line}`);
          session.answer(correct);
        }
        const progress = session.progress();
        assert.ok(
          progress.answeredFresh >= 0 && progress.answeredFresh <= ROUND_SIZE,
          `answeredFresh 越界：${progress.answeredFresh}`,
        );
        assert.ok(
          session.score() >= 0 && session.score() <= ROUND_SIZE,
          `score 越界：${session.score()}`,
        );
        assert.ok(
          session.stars() >= 0 && session.stars() <= 2 * ROUND_SIZE,
          `stars 越界：${session.stars()}`,
        );
        assert.ok(
          session.streak() >= 0 && session.streak() <= 2 * ROUND_SIZE,
          `streak 越界：${session.streak()}`,
        );
      },
    ),
    { numRuns: 200 },
  );

  // 完成後吸收：current() 恆 null、額外作答不得改動計分。
  fc.assert(
    fc.property(
      hostileQuery(),
      fc.integer({ min: 0, max: 0x7fffffff }),
      fc.array(fc.boolean(), { maxLength: 20 }),
      (raw, seed, pattern) => {
        const cfg = parsePlayQuery(raw as RawQuery);
        const session = createSession(
          poolFor(cfg.level, cfg.strings),
          rngFromSeed(seed),
        );
        const pick = (i: number): boolean =>
          pattern.length === 0 ? true : pattern[i % pattern.length]!;
        let guard = 0;
        while (!session.finished() && guard < 200) {
          const question = session.current();
          if (question === null) break;
          session.answer(pick(guard));
          guard += 1;
        }
        assert.ok(session.finished(), "一局必於 200 次作答內完結");

        const before = `${session.score()}/${session.stars()}/${session.streak()}`;
        for (let i = 0; i < 3; i += 1) {
          assert.equal(session.current(), null, "完成後不得再派題");
          session.answer(true);
        }
        assert.equal(
          `${session.score()}/${session.stars()}/${session.streak()}`,
          before,
          "完成後計分凍結",
        );
      },
    ),
    { numRuns: 60 },
  );
});

test("SEC_NO_DANGEROUS_SINK: src 無 raw-HTML／動態求值／命令／檔案／網路／儲存／env sink，亦無硬編碼憑證", () => {
  const scanned = sourceFiles("src").filter((f) => /\.(?:ts|tsx|css)$/.test(f));
  assert.ok(scanned.length >= 10, `掃描檔數異常：${scanned.length}`);
  assert.ok(
    scanned.some((f) => f.endsWith("params.ts")) &&
      scanned.some((f) => f.endsWith("GameScreen.tsx")),
    "掃描範圍須覆蓋解析端與渲染端",
  );

  const sinkHits: string[] = [];
  const secretHits: string[] = [];
  for (const file of scanned) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const [pattern, why] of SINKS)
          if (pattern.test(line))
            sinkHits.push(`${file}:${index + 1} [${why}] ${line.trim()}`);
        for (const [pattern, why] of SECRETS)
          if (pattern.test(line))
            secretHits.push(`${file}:${index + 1} [${why}] ${line.trim()}`);
      });
  }
  assert.deepEqual(sinkHits, [], `發現危險 sink：\n${sinkHits.join("\n")}`);
  assert.deepEqual(secretHits, [], `發現疑似憑證：\n${secretHits.join("\n")}`);
});

test("SEC_SINGLE_PARSE_POINT: 不可信 query 之讀取面唯一，且經已驗證入口 parsePlayQuery", () => {
  const files = sourceFiles("src").filter((f) => /\.(?:ts|tsx)$/.test(f));
  const readers = files.filter((f) =>
    /searchParams|useSearchParams|URLSearchParams|window\.location|location\.search/.test(
      readFileSync(f, "utf8"),
    ),
  );
  assert.deepEqual(
    readers,
    ["src/app/play/page.tsx"],
    "不可信 query 之讀取面必須唯一",
  );

  const entry = readFileSync("src/app/play/page.tsx", "utf8");
  assert.equal(
    (entry.match(/parsePlayQuery\(/g) ?? []).length,
    1,
    "入口須恰好呼叫一次 parsePlayQuery",
  );
});
