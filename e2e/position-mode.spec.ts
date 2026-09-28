import { expect, test, type Page } from "@playwright/test";

// REQ-ui-1：認位置模式完整流程。獨立 oracle：音高→奏法格／正解行（規格表）。
const PLACEMENTS: Record<string, Array<[string, number]>> = {
  G3: [["G", 0]],
  A3: [["G", 1]],
  B3: [["G", 2]],
  C4: [["G", 3]],
  D4: [
    ["D", 0],
    ["G", 4],
  ],
  E4: [["D", 1]],
  F4: [["D", 2]],
  G4: [["D", 3]],
  A4: [
    ["A", 0],
    ["D", 4],
  ],
  B4: [["A", 1]],
  C5: [["A", 2]],
  D5: [["A", 3]],
  E5: [
    ["E", 0],
    ["A", 4],
  ],
  F5: [["E", 1]],
  G5: [["E", 2]],
  A5: [["E", 3]],
  B5: [["E", 4]],
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
const ALL_CELLS: Array<[string, number]> = ["G", "D", "A", "E"].flatMap((s) =>
  [0, 1, 2, 3, 4].map((f) => [s, f] as [string, number]),
);

async function currentNote(page: Page): Promise<string> {
  const staff = page.getByTestId("staff");
  await expect(staff).toBeVisible();
  const note = await staff.getAttribute("data-note");
  expect(note, "五線譜要帶 data-note").not.toBeNull();
  return note as string;
}

test("POSITION_MODE_FLOW: 點正確格→回饋正確、格 ≥48px、作答區模式正確", async ({
  page,
}) => {
  await page.goto("/play?mode=position&level=D");
  await expect(page.getByTestId("play-screen")).toBeVisible();
  await expect(page.getByTestId("letter-A")).toHaveCount(0); // 認音名控件唔應該存在
  const note = await currentNote(page);
  const [s, f] = PLACEMENTS[note][0];
  const cell = page.getByTestId(`cell-${s}-${f}`);
  await expect(cell).toBeVisible();
  const box = await cell.boundingBox();
  expect(box, "格仔必須可見").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(48);
  expect(box!.height).toBeGreaterThanOrEqual(48);
  await cell.click();
  await expect(page.getByTestId("feedback")).toHaveAttribute(
    "data-state",
    "correct",
  );
  await expect(page.getByTestId("feedback")).toBeHidden();
  await expect(page.getByTestId("streak")).toHaveText("連擊 1");
});

test("POSITION_MODE_FLOW: D4 兩種奏法都算對（D空弦／G弦4指）", async ({
  page,
}) => {
  await page.goto("/play?mode=position&level=G");
  await expect(page.getByTestId("play-screen")).toBeVisible();
  const testedCells: string[] = [];
  for (let i = 0; i < 12 && testedCells.length < 2; i++) {
    const note = await currentNote(page);
    if (note === "D4") {
      const cellId = testedCells.length === 0 ? "cell-D-0" : "cell-G-4";
      testedCells.push(cellId);
      await page.getByTestId(cellId).click();
      await expect(page.getByTestId("feedback")).toHaveAttribute(
        "data-state",
        "correct",
      );
      await expect(page.getByTestId("feedback")).toBeHidden();
    } else {
      const [s, f] = PLACEMENTS[note][0];
      await page.getByTestId(`cell-${s}-${f}`).click();
      await expect(page.getByTestId("feedback")).toHaveAttribute(
        "data-state",
        "correct",
      );
      await expect(page.getByTestId("feedback")).toBeHidden();
    }
  }
  expect(testedCells).toEqual(["cell-D-0", "cell-G-4"]);
});

test("POSITION_MODE_FLOW: 答錯→顯示正解文字＋正確格高亮＋continue", async ({
  page,
}) => {
  await page.goto("/play?mode=position&level=D");
  await expect(page.getByTestId("play-screen")).toBeVisible();
  const note = await currentNote(page);
  const valid = PLACEMENTS[note];
  const wrong = ALL_CELLS.find(
    ([s, f]) => !valid.some(([vs, vf]) => vs === s && vf === f),
  )!;
  await page.getByTestId(`cell-${wrong[0]}-${wrong[1]}`).click();
  await expect(page.getByTestId("feedback")).toHaveAttribute(
    "data-state",
    "wrong",
  );
  await expect(page.getByTestId("answer-line")).toHaveText(ANSWER_LINE[note]);
  for (const [s, f] of valid) {
    await expect(page.getByTestId(`cell-${s}-${f}`)).toHaveAttribute(
      "data-state",
      "correct",
    );
  }
  await expect(page.getByTestId("continue")).toBeVisible();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("feedback")).toBeHidden();
});
