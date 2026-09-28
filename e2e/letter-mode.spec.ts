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
  await page.getByTestId("replay").click();
  await expect(page.getByTestId("summary")).toBeHidden();
  await expect(page.getByTestId("progress")).toHaveText("0/10");
  await expect(page.getByTestId("staff")).toBeVisible();
});
