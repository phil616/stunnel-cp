import { test, expect } from "@playwright/test";
const headers = {
  "Content-Type": "application/json",
  "X-CSRF-Protection": "1",
};
test("编辑草稿保护、模式切换、提交失败与密码保护", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !m.text().includes("500 (Internal Server Error)")
    )
      errors.push(m.text());
  });
  const status = await (await request.get("/api/status")).json();
  let auth = await request.post(
    status.setup_required ? "/api/auth/setup" : "/api/auth/login",
    {
      headers,
      data: { username: "admin", password: "rotated-integration-password" },
    },
  );
  if (!auth.ok() && !status.setup_required)
    auth = await request.post("/api/auth/login", {
      headers,
      data: { username: "admin", password: "integration-password-2026" },
    });
  expect(auth.ok()).toBeTruthy();
  await page.context().addCookies((await request.storageState()).cookies);
  await page.goto("/#tunnels");
  const open = async () => {
    await page
      .getByRole("button", { name: "新建隧道", exact: true })
      .first()
      .click();
    return page.getByRole("dialog", { name: "新建隧道配置", exact: true });
  };
  const confirmation = () =>
    page.getByRole("dialog", { name: "放弃未保存的修改？", exact: true });
  const discard = async () => {
    await confirmation()
      .getByRole("button", { name: "放弃修改", exact: true })
      .click();
  };
  const backdrop = async () => {
    await page
      .locator(".mantine-Modal-overlay")
      .last()
      .click({ position: { x: 3, y: 3 }, force: true });
  };
  let editor = await open();
  await backdrop();
  await expect(editor).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).not.toBeVisible();
  editor = await open();
  await editor.getByLabel("隧道名称").fill("draft-server");
  await editor.getByLabel("转发目标").fill("127.0.0.1:7777");
  await backdrop();
  await expect(editor.getByLabel("隧道名称")).toHaveValue("draft-server");
  await expect(editor.getByLabel("转发目标")).toHaveValue("127.0.0.1:7777");
  for (const action of [
    () => page.keyboard.press("Escape"),
    () => editor.getByRole("button", { name: "关闭对话框" }).click(),
    () => editor.getByRole("button", { name: "取消", exact: true }).click(),
  ]) {
    await action();
    await expect(confirmation()).toBeVisible();
    await expect(
      confirmation().getByRole("button", { name: "继续编辑" }),
    ).toBeFocused();
    await confirmation().getByRole("button", { name: "继续编辑" }).click();
    await expect(editor.getByLabel("隧道名称")).toHaveValue("draft-server");
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(confirmation()).not.toBeVisible();
  await expect(editor).toBeVisible();
  await editor
    .locator("label")
    .filter({ hasText: /^客户端$/ })
    .click();
  await editor.getByLabel("转发目标").fill("server.example.com:443");
  await editor.getByLabel("服务端证书身份").fill("server.example.com");
  await editor
    .locator("label")
    .filter({ hasText: /^服务端$/ })
    .click();
  await expect(editor.getByLabel("转发目标")).toHaveValue("127.0.0.1:7777");
  await editor
    .locator("label")
    .filter({ hasText: /^客户端$/ })
    .click();
  await expect(editor.getByLabel("转发目标")).toHaveValue(
    "server.example.com:443",
  );
  await expect(editor.getByLabel("服务端证书身份")).toHaveValue(
    "server.example.com",
  );
  await editor.getByRole("button", { name: "签发证书", exact: true }).click();
  await expect(confirmation()).toBeVisible();
  await confirmation().getByRole("button", { name: "继续编辑" }).click();
  await editor.getByRole("button", { name: "签发证书", exact: true }).click();
  await discard();
  editor = page.getByRole("dialog", { name: "签发证书", exact: true });
  await expect(editor).toBeVisible();
  await editor.getByLabel("证书名称", { exact: true }).fill("unsaved-cert");
  await editor.getByLabel("主题备用名称").fill("cert.example.com");
  await editor
    .locator("label")
    .filter({ hasText: /^客户端认证$/ })
    .click();
  await editor
    .locator("label")
    .filter({ hasText: /^服务端认证$/ })
    .click();
  await expect(editor.getByLabel("主题备用名称")).toHaveValue(
    "cert.example.com",
  );
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await discard();
  // Restoring defaults clears dirty, including mode, TLS and checkbox state.
  editor = await open();
  await editor.getByLabel("隧道名称").fill("temporary");
  await editor.getByLabel("隧道名称").fill("");
  await editor
    .locator("label")
    .filter({ hasText: /^客户端$/ })
    .click();
  await editor
    .locator("label")
    .filter({ hasText: /^服务端$/ })
    .click();
  await editor.getByLabel("最低 TLS 版本").selectOption("TLSv1.3");
  await editor.getByLabel("最低 TLS 版本").selectOption("TLSv1.2");
  await editor.getByLabel("启用此配置").uncheck();
  await editor.getByLabel("启用此配置").check();
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(confirmation()).not.toBeVisible();
  // A hash navigation is also protected and only proceeds after confirmation.
  editor = await open();
  await editor.getByLabel("隧道名称").fill("navigation-draft");
  await page.evaluate(() => {
    location.hash = "authorities";
  });
  await expect(confirmation()).toBeVisible();
  await confirmation().getByRole("button", { name: "继续编辑" }).click();
  await expect(editor.getByLabel("隧道名称")).toHaveValue("navigation-draft");
  await page.evaluate(() => {
    location.hash = "authorities";
  });
  await discard();
  await expect(
    page.getByRole("heading", { name: "证书颁发机构", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "创建 CA", exact: true }).click();
  editor = page.getByRole("dialog", { name: "创建证书颁发机构", exact: true });
  await editor.getByLabel("CA 名称").fill("in-flight-ca");
  await editor.getByLabel("组织名称").fill("Test Org");
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/authorities", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    calls++;
    await held;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "测试提交失败" }),
    });
  });
  await editor.getByRole("button", { name: "创建 CA", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "取消", exact: true }),
  ).toBeDisabled();
  await expect(
    editor.getByRole("button", { name: "关闭对话框" }),
  ).toBeDisabled();
  await backdrop();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("CA 名称")).toBeDisabled();
  expect(calls).toBe(1);
  release();
  await expect(editor.getByRole("alert")).toContainText("测试提交失败");
  await expect(editor.getByLabel("CA 名称")).toHaveValue("in-flight-ca");
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await discard();
  await page.unroute("**/api/authorities");
  // Password drafts share the guard and are never persisted to browser storage.
  await page.getByRole("button", { name: "修改管理员密码" }).click();
  editor = page.getByRole("dialog", { name: "修改管理员密码", exact: true });
  await editor
    .getByLabel("当前密码", { exact: true })
    .fill("sensitive-guard-test");
  await backdrop();
  await page.keyboard.press("Escape");
  await expect(confirmation()).toBeVisible();
  await confirmation().getByRole("button", { name: "继续编辑" }).click();
  await expect(editor.getByLabel("当前密码", { exact: true })).toHaveValue(
    "sensitive-guard-test",
  );
  expect(
    await page.evaluate(() => JSON.stringify([localStorage, sessionStorage])),
  ).not.toContain("sensitive-guard-test");
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await discard();
  expect(errors).toEqual([]);
});
