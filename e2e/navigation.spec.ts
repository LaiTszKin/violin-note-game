import { expect, test } from "@playwright/test";

// REQ-ui-1 / REQ-ui-2：開始頁契約、導向、觸控尺寸、無水平滾動、無 JS 錯誤。

test("NAV_START_SCREEN: 開始頁齊料、模式 aria-pressed 切換、關卡掣 ≥48px、無水平滾動", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await expect(page.getByTestId("start-screen")).toBeVisible();
  await expect(page.getByTestId("mode-letter")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("mode-position")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByTestId("mode-position").click();
  await expect(page.getByTestId("mode-position")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("mode-letter")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const levelIds = ["level-G", "level-D", "level-A", "level-E", "level-mixed"];
  for (const id of levelIds) {
    const el = page.getByTestId(id);
    await expect(el).toBeVisible();
    const box = await el.boundingBox();
    expect(box, `${id} 必須可見`).not.toBeNull();
    expect(box!.width, `${id} 闊度`).toBeGreaterThanOrEqual(48);
    expect(box!.height, `${id} 高度`).toBeGreaterThanOrEqual(48);
  }
  for (const id of [
    "custom-G",
    "custom-D",
    "custom-A",
    "custom-E",
    "start-custom",
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(noOverflow, "開始頁不得水平滾動").toBe(true);
  expect(errors, "開始頁不得有 JS 錯誤").toEqual([]);
});

// RA-6：/play 兩 viewport 皆不得水平溢出（GameScreen minWidth／overflowX 突變靠呢度捉）。
type Viewport = { width: number; height: number };
const PLAY_VIEWPORTS: readonly Viewport[] = [
  { width: 1280, height: 720 }, // desktop chrome
  { width: 810, height: 1080 }, // tablet（iPad gen 7）
];

test("NO_HORIZONTAL_OVERFLOW: /play（letter／position）喺 desktop 1280×720 同 tablet 810×1080 皆無水平溢出", async ({
  page,
}) => {
  for (const mode of ["letter", "position"]) {
    await page.goto(`/play?mode=${mode}&level=G`);
    await expect(page.getByTestId("play-screen")).toBeVisible();
    for (const viewport of PLAY_VIEWPORTS) {
      await page.setViewportSize(viewport);
      const metrics = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        inner: window.innerWidth,
      }));
      const label = `/${mode} @ ${viewport.width}×${viewport.height}`;
      expect(
        metrics.inner,
        `${label} innerWidth 不應超 viewport`,
      ).toBeLessThanOrEqual(viewport.width);
      expect(
        metrics.doc,
        `${label} documentElement 不得水平溢出`,
      ).toBeLessThanOrEqual(metrics.inner + 1);
      expect(metrics.body, `${label} body 不得水平溢出`).toBeLessThanOrEqual(
        metrics.inner + 1,
      );
    }
  }
});

// D-12：back 掣（遊戲頁返回）可見、指回 "/"，點擊一次驗證導航。
test("NAV_BACK: back 掣可見、href=/、點擊一次返到開始頁", async ({ page }) => {
  await page.goto("/play?mode=letter&level=G");
  await expect(page.getByTestId("play-screen")).toBeVisible();
  const back = page.getByTestId("back");
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute("href", "/");
  await back.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/" && url.search === "",
  );
  await expect(page.getByTestId("start-screen")).toBeVisible();
});

test("NAV_START_SCREEN: 揀模式＋關卡→/play 帶正確參數；遊戲頁載入", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("mode-position").click();
  await page.getByTestId("level-G").click();
  await expect(page).toHaveURL(/\/play\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("mode")).toBe("position");
  expect(url.searchParams.get("level")).toBe("G");
  await expect(page.getByTestId("play-screen")).toBeVisible();
});

test("NAV_START_SCREEN: 自選弦——未揀不可開始；揀後開始並帶 strings（過濾、定序）", async ({
  page,
}) => {
  await page.goto("/");
  const startCustom = page.getByTestId("start-custom");
  await expect(startCustom).toBeVisible();
  await expect(startCustom).toBeDisabled();
  // 先揀 A 再揀 D：輸出應為固定弦序 D,A
  await page.getByTestId("custom-A").check();
  await page.getByTestId("custom-D").check();
  await expect(startCustom).toBeEnabled();
  await startCustom.click();
  await expect(page).toHaveURL(/level=custom/);
  const url = new URL(page.url());
  expect(url.searchParams.get("strings")).toBe("D,A");
  expect(url.searchParams.get("mode")).toBe("letter");
  await expect(page.getByTestId("play-screen")).toBeVisible();
});
