# ACCEPTANCE — violin-note-game

**Evidence standard.** Property-based tests are the primary instrument, using the property library the repository ALREADY has — never add a dependency to make a plan testable. A deterministic sample is allowed only as a regression added beside a confirmed counterexample; it never replaces the property. "Run it once and look" is not evidence — it is either an alternative-evidence item `A-<item>-<n>` (runnable command + what a human inspects) or it is nothing. The REQ set below EQUALS the REQ set of `PRD.md`.

Stack: `tsx` + `node:test` + `fast-check` (unit/PBT)；`@playwright/test`（e2e：chromium `chrome`＋webkit `tablet`＝iPad (gen 7) 直向）。

## Run commands (each executed once before being written here)

| Suite (`--filter` / path) | Exact command | Collects (glob) | PBT library present |
| --- | --- | --- | --- |
| unit: note-model | `npx tsx --test test/note-model.test.ts` | `test/note-model.test.ts` | fast-check ✓ |
| unit: levels/params | `npx tsx --test test/levels.test.ts` | `test/levels.test.ts` | fast-check ✓ |
| unit: bag | `npx tsx --test test/shuffle.test.ts` | `test/shuffle.test.ts` | fast-check ✓ |
| unit: session | `npx tsx --test test/session.test.ts` | `test/session.test.ts` | fast-check ✓ |
| unit: judging | `npx tsx --test test/judging.test.ts` | `test/judging.test.ts` | fast-check ✓ |
| unit: audio | `npx tsx --test test/audio.test.ts` | `test/audio.test.ts` | fast-check ✓ |
| e2e: navigation | `npx playwright test e2e/navigation.spec.ts` | `e2e/navigation.spec.ts` | n/a（e2e） |
| e2e: letter-mode | `npx playwright test e2e/letter-mode.spec.ts` | `e2e/letter-mode.spec.ts` | n/a（e2e） |
| e2e: position-mode | `npx playwright test e2e/position-mode.spec.ts` | `e2e/position-mode.spec.ts` | n/a（e2e） |

## Propositions and acceptance rows (one row per REQ)

| REQ | Proposition (test title, verbatim) | Generator domain | Counterexample shape | Test site (file : title) | Run command | Baseline |
| --- | --- | --- | --- | --- | --- | --- |
| `REQ-model-1` | `NOTE_CATALOG_EXACT: NOTES 恰 20 項、PITCH_IDS 恰 17 個，音高對照與規格一致` | 全表（窮舉 20） | 缺項／錯音名／重複音高 | `test/note-model.test.ts` | `npx tsx --test test/note-model.test.ts` | red |
| `REQ-model-1` | `LETTER_NAMING_AGNOSTIC: 音名字母唯一且跨八度相同（A3/A4/A5 → A）` | fc.constantFrom(17 音) ＋ 跨八度組 | 字母錯／八度敏感 | `test/note-model.test.ts` | 同上 | red |
| `REQ-staff-1` | `STAFF_COORDINATE_EXACT: 每個音之 staffStepOf／midiOf 與規格表一致（線偶間奇）` | 全表（窮舉 20） | 線間錯位／少加線 | `test/note-model.test.ts` | 同上 | red |
| `REQ-model-2` | `PLACEMENTS_EXACT: placementsOf 每音 ≥1；D4/A4/E5 恰 2（空弦先行）其餘恰 1，全部 ∈ 合法範圍` | 全表＋fc.constantFrom | 漏第二奏法／次序錯 | `test/note-model.test.ts` | 同上 | red |
| `REQ-model-2` | `ANSWER_LINE_FORMAT: answerLine＝「<字母> ＝ <奏法 或 …>」；formatPlacement(0指)＝「<弦>空弦」` | 全表（窮舉 20） | 格式偏差 | `test/note-model.test.ts` | 同上 | red |
| `REQ-levels-1` | `POOL_FOR_LEVEL_EXACT: 單弦關＝該弦 5 音；mixed＝17 音；custom＝所選弦聯集（弦序、去重）` | 窮舉 4 弦＋fc.subarray/子集（含空集、全選、重複輸入） | 漏音／次序錯／重複 | `test/levels.test.ts` | `npx tsx --test test/levels.test.ts` | red |
| `REQ-params-1` | `QUERY_PARSE_RULES: 合法值採用；缺/非法 fallback（mode→letter、level→mixed、custom 空→mixed）；strings 過濾/去重/定序` | 表格用例＋fc.dictionary(fc.string()) 敵意輸入（空、垃圾、陣列值） | fallback 錯／接受垃圾 | `test/levels.test.ts` | 同上 | red |
| `REQ-round-1` | `BAG_COVERS_POOL: 任意 seed／池大小之下，每輪＝全數一次；k 抽之覆蓋數＝預期（≤ceil(k/n) 等）` | fc.integer seed × pool 2–20 × k 1–3n | 漏項／重複 coverage 錯 | `test/shuffle.test.ts` | `npx tsx --test test/shuffle.test.ts` | red |
| `REQ-round-1` | `NO_ADJACENT_REPEAT: 連續抽取不得相同（含跨輪邊界；pool>1）` | 同上 | 相鄰相同 | `test/shuffle.test.ts` | 同上 | red |
| `REQ-round-2` | `ROUND_TEN_FRESH: 新題恰 10、袋式（無相鄰重複）；progress 0→10；完成前未 finished` | fc seed × pool × 應答模式 | 題數錯／提早 finished | `test/session.test.ts` | `npx tsx --test test/session.test.ts` | red |
| `REQ-round-2` | `REQUEUE_RULES: 錯題 FIFO 各重出恰一次（新題後）；重出不再排；score/stars/streak 按定義` | fc（錯題子集模式） | 重出次數/次序錯、計分錯 | `test/session.test.ts` | 同上 | red |
| `REQ-judge-1` | `LETTER_JUDGE: 正確字母接受、其餘（含小寫、空字串）拒絕；八度無關` | 全表 × fc.string() 敵意 | 錯接受/錯拒絕 | `test/judging.test.ts` | `npx tsx --test test/judging.test.ts` | red |
| `REQ-judge-2` | `POSITION_JUDGE: ∈placementsOf 接受（D4/A4/E5 兩奏法都對）；20 格中其餘拒絕` | 全表 × 全部 20 {弦,指} 組合 | 漏接受/錯接受 | `test/judging.test.ts` | 同上 | red |
| `REQ-audio-1` | `PITCH_FREQUENCY_EXACT: frequencyOf＝440×2^((midi−69)/12)（±0.01Hz）且單調遞增` | 全 17 音＋獨立公式（oracle） | 半音錯／A4≠440 | `test/audio.test.ts` | `npx tsx --test test/audio.test.ts` | red |
| `REQ-audio-1` | `PLAYER_MUTE_RESPECTED: play 以該音頻率起振（注入 fake context 觀測）；muted 時不起振` | 全 17 音（fc.constantFrom）× mute 兩態 | 頻率錯／mute 無效 | `test/audio.test.ts` | 同上 | red |
| `REQ-ui-1` | `NAV_START_SCREEN`（3 tests）：開始頁齊料＋大字＋模式 aria-pressed；揀關卡→URL 正確；自選未揀不可開始、揀後可開始帶參數 | e2e（chromium＋webkit） | 缺元素／URL 錯／disabled 錯 | `e2e/navigation.spec.ts` | `npx playwright test e2e/navigation.spec.ts` | red |
| `REQ-ui-1` | `LETTER_MODE_FLOW`（3 tests）：答對回饋＋連擊＋自動前進；答錯顯示正解＋稍後重出＋結算 9/10；全對 10 題結算 10/10＋replay 重設 | e2e | 行為與契約不符 | `e2e/letter-mode.spec.ts` | `npx playwright test e2e/letter-mode.spec.ts` | red |
| `REQ-ui-1` | `POSITION_MODE_FLOW`（3 tests）：格仔作答正確；D4 兩奏法均接受；答錯顯示正解＋高亮正確格 | e2e | 行為與契約不符 | `e2e/position-mode.spec.ts` | `npx playwright test e2e/position-mode.spec.ts` | red |
| `REQ-ui-2` | `TAP_TARGET_SIZE`: 關卡掣／答案掣／指板格 boundingBox ≥48×48 | e2e（兩 viewport） | 過細／唔可見 | `e2e/navigation.spec.ts` ＋ letter/position 內 | 各 spec 命令 | red |
| `REQ-ui-2` | `NO_HORIZONTAL_OVERFLOW`: 兩 viewport 無水平滾動＋流程中零 console error | e2e | overflow／console error | `e2e/navigation.spec.ts` ＋ `e2e/letter-mode.spec.ts` | 各 spec 命令 | red |

## Red baseline

- Must be RED on today's tree: 全部 proposition 行（實作未開始，只有 stubs）。
- **實測（2026-09-28）**：unit 6 個命令、15 個測試＝0 pass／15 fail（exit=1）；e2e 3 個命令、9 個測試 × 2 projects（chrome／tablet·webkit）＝0 pass／18 fail。逐檔原始輸出見 evidence 目錄 `red-unit-*.log`、`red-e2e-*.log`。
- Already GREEN on today's tree (regression pins): 無。
- Evidence: `~/.hermes/cache/pdd-evidence/violin-note-game/red-baseline-20260928.md`，captured 2026-09-28；freeze sha 記錄於該檔案及 commit `test: violin-note-game (red baseline)`。

## Alternative evidence (non-PBT)

| ID | Command | What the human inspects | Discharges |
| --- | --- | --- | --- |
| `A-ui-1` | `npm run dev`（瀏覽器開 localhost:3000）＋實機 iPad Safari | 音色可接受（合成音）、音量適中、介面觀感 | `REQ-audio-1` 之主觀聽感部分 |
| `A-deploy-1` | `npm run build && npm run start` | production build 成功、route `/` 及 `/play` 正常 | 部署前檢查（非 v1 範圍） |

## Gaps and risks

- `R-1` e2e 以 dev server（Turbopack）運行，非 production build；production build 由 `npm run build` 另檢。
- `R-2` webkit／iPad (gen 7) 為模擬非真機；真機 iPad Safari 實測留待部署前（用戶實測）。
- `R-3` 音色為合成音，非小提琴取樣（`A-ui-1` 主觀驗收）。
