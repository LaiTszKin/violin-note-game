# PRD — violin-note-game: 小學小提琴認譜遊戲 v1

| Field | Value |
| --- | --- |
| Plan | `violin-note-game`：v1 完整遊戲（雙模式、20 音、關卡、回饋、音效） |
| Date | 2026-09-28 |
| Status | Frozen — settled by discussion; not yet implemented |
| Source | 用戶需求（2026-09-28 對話）：C 大調一把位、空弦＋1–4 指、點擊式認譜遊戲；部署目標 Vercel |
| Related | `ACCEPTANCE.md` — per-REQ propositions and evidence |

**Brevity contract.** 本文只載：已定決策、需求清單、每項需求之量度方式。背景與 repo 現況由實作者自行讀取。

## Decisions (settled; not up for re-discussion)

- **D1 技術**：Next.js（App Router、TypeScript、Turbopack）＋ React；純前端、無後端／資料庫／儲存；部署目標 Vercel（本階段不部署）。Rejected: 單一 HTML 檔 — 用戶指定 Next.js/Vercel 路線。
- **D2 工具鏈**：tsc 7.0.2 ＋ @typescript/typescript6 API（official side-by-side；typescript-eslint 需要 TS6 API）；eslint 9.39.5（上游 plugin 未支援 ESLint 10）；tsx ＋ node:test ＋ fast-check（契約／PBT）；@playwright/test（e2e，chromium＋webkit）。Rejected: vitest — 本機 Node 專案慣例為 node:test。
- **D3 題庫**：4 弦 × 0–4 指 ＝ 20 個按弦項目、17 個不同音高（G3–B5）；音名＝字母、不分八度。Rejected: 只做 1–4 指 — 用戶後期指示加入空弦。
- **D4 雙奏法判定**：D4／A4／E5 一律兩種奏法都算對；回饋同時顯示兩種。Rejected: 單弦關卡收窄 — 用戶選擇「一律兩種都算對」。
- **D5 局流程**：每局 10 條新題（袋抽、無相鄰重複）；答錯之新題於全部新題問完後、按答錯次序（FIFO）各重出一次；答對永不重出。Rejected: 即時再問／重抽入袋 — 次數不確定、可測性低。
- **D6 結算**：答對 `X/10`（首答）；星星＝本局答對總數（含重出）；連擊即時顯示（錯→0）。
- **D7 音效**：作答後播放該音（12 平均律、A4=440Hz、合成音色）；mute 掣（session 內有效）。
- **D8 關卡**：G／D／A／E（各 5 音）＋混合（17 音）＋自選弦組合；全部關卡開放。
- **D9 介面**：繁體中文、音名英文 A–G、大按鈕（≥48px）、平板優先、手機／電腦可用、無 console error。
- **D10 範圍外**：反向題型、統計報表、進度儲存、帳號、部署（待用戶指示）。

## Requirements

### 音庫與譜面（model / staff）

#### REQ-model-1 題庫對照
- **Statement**: `NOTES` 恰 20 項（string∈{G,D,A,E} × finger∈{0..4}），音高對照＝ G: G3 A3 B3 C4 D4｜D: D4 E4 F4 G4 A4｜A: A4 B4 C5 D5 E5｜E: E5 F5 G5 A5 B5；`PITCH_IDS` 恰 17 個（升序、去重）。
- **Rationale**: 用戶 16 音對照表＋空弦追加。
- **Testability**: `NOTE_CATALOG_EXACT`；`LETTER_NAMING_AGNOSTIC`。

#### REQ-staff-1 五線譜座標
- **Statement**: `staffStepOf`：E4＝0（底線），每高一級 +1（線＝偶數、間＝奇數）；對照＝ {G3:-5, A3:-4, B3:-3, C4:-2, D4:-1, E4:0, F4:1, G4:2, A4:3, B4:4, C5:5, D5:6, E5:7, F5:8, G5:9, A5:10, B5:11}；`midiOf` 為標準 MIDI 音號。
- **Rationale**: 教認譜必須畫對線／間／加線。
- **Testability**: `STAFF_COORDINATE_EXACT`。

#### REQ-model-2 奏法與顯示格式
- **Statement**: `placementsOf`：每音 ≥1 個 {弦,指}；D4＝{D空弦, G弦4指}、A4＝{A空弦, D弦4指}、E5＝{E空弦, A弦4指}（顯示次序＝空弦先行）、其餘各恰 1 個。`formatPlacement`：finger 0→「<弦>空弦」，否則「<弦>弦<n>指」。`answerLine`＝「<字母> ＝ <奏法 或 …>」，如 `D ＝ D空弦 或 G弦4指`、`A3 ＝ G弦1指`、`G3 ＝ G空弦`。
- **Rationale**: D4 判定選擇＋回饋要顯示完整對應。
- **Testability**: `PLACEMENTS_EXACT`；`ANSWER_LINE_FORMAT`。

### 關卡與出題（levels / round）

#### REQ-levels-1 題池
- **Statement**: `poolFor(level, strings)`：G/D/A/E → 該弦 5 音（弦序）；mixed → 17 音（弦序）；custom → 所選弦之聯集（固定弦序 G,D,A,E、去重）。
- **Rationale**: 按弦分關卡＋自選。
- **Testability**: `POOL_FOR_LEVEL_EXACT`。

#### REQ-params-1 URL 參數
- **Statement**: `/play?mode=&level=&strings=`。mode∈{letter,position}，缺／非法→letter；level∈{G,D,A,E,mixed,custom}，缺／非法→mixed；level=custom 而 strings 無有效值→mixed；strings＝逗號分隔，只接受 G/D/A/E、去重、固定弦序。
- **Rationale**: 開始頁導向＋直接連結（老師可分享 URL）。
- **Testability**: `QUERY_PARSE_RULES`。

#### REQ-round-1 抽題（袋）
- **Statement**: `createBag(items, rng)`：每輪（pass）＝items 之全洗牌排列；一輪抽盡先重洗；跨輪邊界不得連續抽出相同項（items>1）。
- **Rationale**: 覆蓋均勻＋不連續重複。
- **Testability**: `BAG_COVERS_POOL`；`NO_ADJACENT_REPEAT`。

#### REQ-round-2 局流程
- **Statement**: `createSession(pool, rng)`：一局＝10 條新題（袋抽）；答錯之新題在全部新題完結後、按答錯次序 FIFO 各重出恰一次；重出答錯不再重出；`progress().answeredFresh` 0→10；`finished()` 需新題＋重出全部答完；`score()`＝首答答對數；`stars()`＝答對總數（含重出）；`streak()`＝連續答對數（錯→0）。`current()` 未完成前非 null、完成後 null。
- **Rationale**: 每局 10 題＋答錯稍後重出一次。
- **Testability**: `ROUND_TEN_FRESH`；`REQUEUE_RULES`。

### 判定（judging）

#### REQ-judge-1 認音名判定
- **Statement**: letter 作答＝只接受與 `letterOf(noteId)` 相同之單一字母（大小寫敏感，UI 一律大寫）；與八度無關（A3／A4／A5 均答 `A`）。
- **Rationale**: 音名以字母判定、不分八度。
- **Testability**: `LETTER_JUDGE`。

#### REQ-judge-2 認位置判定
- **Statement**: position 作答＝{string,finger} ∈ `placementsOf(noteId)` 為對；D4／A4／E5 之兩個奏法均接受；範圍外組合一律拒絕。
- **Rationale**: D4 雙奏法決策。
- **Testability**: `POSITION_JUDGE`。

### 音效（audio）

#### REQ-audio-1 音高與播放
- **Statement**: `frequencyOf`＝12 平均律、A4=440Hz（G3≈196.00、D4≈293.66、E5≈659.26、B5≈987.77 等）；player `play(noteId)` 以該頻率起振（可經注入之 contextFactory 觀測）；`setMuted(true)` 後 `play` 唔起振；`isMuted()` 反映狀態。
- **Rationale**: 作答後聽實際音高；mute 掣。
- **Testability**: `PITCH_FREQUENCY_EXACT`；`PLAYER_MUTE_RESPECTED`。

### 介面（ui）

#### REQ-ui-1 畫面與流程契約
- **Statement**: 開始頁：`[data-testid=start-screen]`、模式掣 `mode-letter`／`mode-position`（aria-pressed 反映選中）、關卡掣 `level-G|D|A|E|mixed`、自選 checkbox `custom-G|D|A|E` 及 `start-custom`（未揀任何弦時不可開始）。導向 `/play?mode=…&level=…[&strings=…]`。遊戲頁：`play-screen`、`back`、`mute-toggle`（aria-pressed 反映 mute）、`progress`（文字＝已答新題數 `n/10`）、`streak`（文字＝`連擊 n`，未答前 `連擊 0`）、`staff[data-note=音名]`、作答區＝認音名 `letter-A…letter-G` 七粒／認位置 `cell-<弦>-<指>`（20 格；只可出現當前模式之控件）、回饋 `feedback[data-state=correct|wrong]`＋`answer-line`（＝`answerLine(note)`）＋wrong 時 `continue` 掣；答對自動前進（約 900ms，測試捕捉得到）、答錯等 `continue`；答錯時正確之格／掣得 `data-state="correct"`。結算：`summary`、`final-score`（文字 `X/10`）、`final-stars`（文字＝星數）、`replay`、`back-home`。
- **Rationale**: 雙模式＋回饋＋結算之可驗收契約。
- **Testability**: e2e `NAV_START_SCREEN`；`LETTER_MODE_FLOW`；`POSITION_MODE_FLOW`。

#### REQ-ui-2 觸控與版面
- **Statement**: 全部可按元素（關卡掣、答案掣、指板格）≥48×48 CSS px；iPad 直向（810×1080, webkit）及桌面 Chrome 無水平滾動；載入及流程中無 console error。
- **Rationale**: 小學生手指點擊；平板優先。
- **Testability**: e2e `TAP_TARGET_SIZE`；`NO_HORIZONTAL_OVERFLOW`。

## Non-goals

- 空弦以外音域、升降號、其他調性／把位；帳號、進度儲存、排行榜；反向題型；統計報表；Vercel 部署（待用戶指示）。

## Open questions

- （無——全部已由用戶決定或本文件 D1–D10 定案。）
