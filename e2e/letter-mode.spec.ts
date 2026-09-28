import { expect, test, type Page } from "@playwright/test";

// REQ-ui-1：認音名模式完整流程。獨立 oracle：音高→字母／正解行（規格表）。
const LETTER: Record<string, string> = {
  G3: "G",
  A3: "A",
  B3: "B",
  C4: "C",
  D4: "D",
  E4: "E",
  F4: "F",
  G4: "G",
  A4: "A",
  B4: "B",
  C5: "C",
  D5: "D",
  E5: "E",
  F5: "F",
  G5: "G",
  A5: "A",
  B5: "B",
};
const ANSWER_LINE: Record<string, string> = {
  G3: "G ＝ G空弦",
  A3: "A ＝ G弦1指",
  B3: "B ＝ G弦2指",
  C4: "C ＝ G弦3指",
  D4: "D ＝ D空弦 或 G弦4指",
  E4: "E ＝ D弦1指",
  F4: "F ＝ D弦2指",
  G4: "G ＝ D弦3指",
  A4: "A ＝ A空弦 或 D弦4指",
  B4: "B ＝ A弦1指",
  C5: "C ＝ A弦2指",
  D5: "D ＝ A弦3指",
  E5: "E ＝ E空弦 或 A弦4指",
  F5: "F ＝ E弦1指",
  G5: "G ＝ E弦2指",
  A5: "A ＝ E弦3指",
  B5: "B ＝ E弦4指",
};

async function currentNote(page: Page): Promise<string> {
  const staff = page.getByTestId("staff");
  await expect(staff).toBeVisible();
  const note = await staff.getAttribute("data-note");
  expect(note, "五線譜要帶 data-note").not.toBeNull();
  return note as string;
}

async function answerCorrectly(page: Page): Promise<string> {
  const note = await currentNote(page);
  await page.getByTestId(`letter-${LETTER[note]}`).click();
  await expect(page.getByTestId("feedback")).toHaveAttribute(
    "data-state",
    "correct",
  );
  await expect(page.getByTestId("feedback")).toBeHidden();
  return note;
}

test("LETTER_MODE_FLOW: 答對→回饋正確、連擊＋1、自動下一題、進度遞增、作答區模式正確", async ({
  page,
}) => {
  await page.goto("/play?mode=letter&level=G");
  await expect(page.getByTestId("play-screen")).toBeVisible();
  await expect(page.getByTestId("progress")).toHaveText("0/10");
  await expect(page.getByTestId("letter-A")).toBeVisible();
  await expect(page.getByTestId("cell-G-0")).toHaveCount(0); // 認位置控件唔應該存在
  await expect(page.getByTestId("streak")).toHaveText("連擊 0");
  await answerCorrectly(page);
  await expect(page.getByTestId("progress")).toHaveText("1/10");
  await expect(page.getByTestId("streak")).toHaveText("連擊 1");
  const mute = page.getByTestId("mute-toggle");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await answerCorrectly(page);
  await answerCorrectly(page);
  await expect(page.getByTestId("progress")).toHaveText("3/10");
  await expect(page.getByTestId("streak")).toHaveText("連擊 3");
});

test("LETTER_MODE_FLOW: 答錯→顯示正解、稍後重出一次、結算 9/10", async ({
  page,
}) => {
  await page.goto("/play?mode=letter&level=G");
  await expect(page.getByTestId("play-screen")).toBeVisible();
  const order: string[] = [];
  let wrongNote: string | null = null;
  for (let i = 0; i < 30; i++) {
    if (await page.getByTestId("summary").isVisible()) break;
    const note = await currentNote(page);
    if (order.length === 0) {
      wrongNote = note;
      const wrongLetter = LETTER[note] === "A" ? "B" : "A";
      await page.getByTestId(`letter-${wrongLetter}`).click();
      await expect(page.getByTestId("feedback")).toHaveAttribute(
        "data-state",
        "wrong",
      );
      await expect(page.getByTestId("answer-line")).toHaveText(
        ANSWER_LINE[note],
      );
      await expect(page.getByTestId("continue")).toBeVisible();
      await page.getByTestId("continue").click();
      await expect(page.getByTestId("feedback")).toBeHidden();
    } else {
      await answerCorrectly(page);
    }
    order.push(note);
  }
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByTestId("final-score")).toHaveText("9/10");
  // G 關池 5 音 × 2 輪：每音 2 次新題；錯音多 1 次重出（喺全部新題之後）
  expect(order.length).toBe(11);
  expect(order[10]).toBe(wrongNote);
  const counts = new Map<string, number>();
  order.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  expect(counts.size).toBe(5);
  for (const [n, c] of counts)
    expect(c, `${n} 出現次數`).toBe(n === wrongNote ? 3 : 2);
});

test("LETTER_MODE_FLOW: 全對 10 題→10/10；再玩一次重設新局", async ({
  page,
}) => {
  await page.goto("/play?mode=letter&level=mixed");
  await expect(page.getByTestId("play-screen")).toBeVisible();
  for (let i = 0; i < 10; i++) await answerCorrectly(page);
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByTestId("final-score")).toHaveText("10/10");
  await expect(page.getByTestId("final-stars")).toHaveText("10");
  // D-12：結算畫面備有 back-home 掣（返首頁）——可見且指向 "/"。
  const backHome = page.getByTestId("back-home");
  await expect(backHome).toBeVisible();
  await expect(backHome).toHaveAttribute("href", "/");
  await page.getByTestId("replay").click();
  await expect(page.getByTestId("summary")).toBeHidden();
  await expect(page.getByTestId("progress")).toHaveText("0/10");
  await expect(page.getByTestId("staff")).toBeVisible();
});

const ALL_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

// RA-5：TAP_TARGET_SIZE——七粒答案掣全部量度（minHeight:0／height:30 突變要喺度被捉）。
test("TAP_TARGET_SIZE: letter 模式七粒答案掣全部 ≥48×48", async ({ page }) => {
  await page.goto("/play?mode=letter&level=G");
  await expect(page.getByTestId("play-screen")).toBeVisible();
  await expect(page.locator('[data-testid^="letter-"]')).toHaveCount(7);
  for (const letter of ALL_LETTERS) {
    const el = page.getByTestId(`letter-${letter}`);
    await expect(el).toBeVisible();
    const box = await el.boundingBox();
    expect(box, `letter-${letter} 必須可見`).not.toBeNull();
    expect(box!.width, `letter-${letter} 闊度`).toBeGreaterThanOrEqual(48);
    expect(box!.height, `letter-${letter} 高度`).toBeGreaterThanOrEqual(48);
  }
});

// RA-6：真實玩法流程掛 console 監聽——console error／pageerror 零輸出（submit 亂 log 要在此被捉）。
test("NO_HORIZONTAL_OVERFLOW: letter 模式真實玩法流程零 console error／pageerror", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("/play?mode=letter&level=G");
  await expect(page.getByTestId("play-screen")).toBeVisible();

  // 真實玩法：先答錯一題（正解行＋continue），再答對一題。
  const note = await currentNote(page);
  const wrongLetter = LETTER[note] === "A" ? "B" : "A";
  await page.getByTestId(`letter-${wrongLetter}`).click();
  await expect(page.getByTestId("feedback")).toHaveAttribute(
    "data-state",
    "wrong",
  );
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("feedback")).toBeHidden();
  await answerCorrectly(page);
  await expect(page.getByTestId("progress")).toHaveText("2/10");

  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(noOverflow, "遊戲頁不得水平滾動").toBe(true);
  expect(errors, "流程中不得有 console error／pageerror").toEqual([]);
});

// RA-7：假 WebAudio（起振記錄喺 window.__osc）——驗 mute 掣 UI 真係接到 player。
// 注意：此函數會原樣送進 page context，唔可以引用模組作用域嘅任何變數。
function installFakeAudioContext(): void {
  const scope = window as unknown as {
    __osc: number[];
    AudioContext: unknown;
  };
  scope.__osc = [];
  class FakeOscillator {
    type = "sine";
    frequency = { value: 0 };
    connect() {
      return this;
    }
    start() {
      scope.__osc.push(this.frequency.value);
    }
    stop() {}
  }
  class FakeGain {
    gain = { value: 0 };
    connect() {
      return this;
    }
  }
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    state = "running";
    resume() {
      return Promise.resolve();
    }
    createOscillator() {
      return new FakeOscillator();
    }
    createGain() {
      return new FakeGain();
    }
  }
  scope.AudioContext = FakeAudioContext;
}

/** 讀假 AudioContext 記低嘅起振次數。 */
async function oscillatorStartCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __osc?: number[] }).__osc?.length ?? 0,
  );
}

test("MUTE_WIRING: 靜音時答題零起振；解除靜音後答題有新起振", async ({
  page,
}) => {
  await page.addInitScript(installFakeAudioContext);
  await page.goto("/play?mode=letter&level=G");
  await expect(page.getByTestId("play-screen")).toBeVisible();

  const mute = page.getByTestId("mute-toggle");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  expect(await oscillatorStartCount(page), "未答題前不應起振").toBe(0);

  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await answerCorrectly(page);
  expect(await oscillatorStartCount(page), "靜音期間答題不得起振").toBe(0);

  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await answerCorrectly(page);
  await expect
    .poll(() => oscillatorStartCount(page), {
      message: "解除靜音後答題要起振",
    })
    .toBeGreaterThan(0);
});
