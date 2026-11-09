import { test, expect } from "@playwright/test";

test("从初始化到 mTLS 部署包与证书吊销", async ({ page }) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "创建管理员" })).toBeVisible();
  await page
    .getByLabel("密码", { exact: true })
    .fill("integration-password-2026");
  await page.getByRole("button", { name: "创建管理员" }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  await page.getByRole("button", { name: "证书颁发机构", exact: true }).click();
  await page.getByRole("button", { name: "创建 CA", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("CA 名称").fill("Production Root CA");
  await dialog.getByLabel("组织名称").fill("Example Infrastructure");
  await dialog.getByRole("button", { name: "创建 CA", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Production Root CA", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "证书管理", exact: true }).click();
  await page
    .getByRole("button", { name: "签发证书", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("签发 CA")
    .selectOption({ label: "Production Root CA" });
  await dialog.getByLabel("证书名称", { exact: true }).fill("redis-server");
  await dialog.getByLabel("通用名称").fill("redis.example.com");
  await dialog.getByLabel("主题备用名称").fill("redis.example.com, 127.0.0.1");
  await dialog
    .locator("summary")
    .filter({ hasText: "SAN 与 CN 填写规则" })
    .click();
  await expect(dialog.locator(".certificate-help")).toContainText(
    "CN 可以不同",
  );
  await expect(
    dialog.getByRole("link", { name: "查看完整证书规范（新标签页）" }),
  ).toHaveAttribute("href", "/#pki-guide");
  await dialog.getByRole("button", { name: "签发证书", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "隧道配置", exact: true }).click();
  await page
    .getByRole("button", { name: "新建隧道", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("隧道名称").fill("redis-production");
  await dialog
    .getByLabel("身份认证证书")
    .selectOption(
      await dialog
        .getByLabel("身份认证证书")
        .locator("option")
        .nth(1)
        .getAttribute("value"),
    );
  await dialog.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "redis-production 服务端" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "预览 redis-production", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator("pre")).toContainText("verifyChain = yes");
  const attachment = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载部署包", exact: true }).click();
  const file = await attachment;
  expect(file.suggestedFilename()).toBe("redis-production.zip");
  await dialog.getByRole("button", { name: "关闭对话框" }).click();
  // Editing persists and client-mode settings are validated by the backend.
  await page.getByRole("button", { name: "编辑 redis-production" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("描述").fill("生产环境 Redis 双向认证");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await expect(dialog).not.toBeVisible();

  // Open reference documentation without losing an unfinished client form.
  await page.getByRole("button", { name: "新建隧道", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "客户端", exact: true }).click();
  await dialog.getByLabel("隧道名称").fill("pending-client");
  await dialog.getByLabel("转发目标").fill("10.0.0.8:6380");
  await dialog.getByLabel("服务端证书身份").fill("redis.example.com");
  await dialog
    .locator("summary")
    .filter({ hasText: "地址与证书匹配规则" })
    .click();
  await expect(dialog.locator(".certificate-help")).toContainText(
    "保存配置不会验证远端实际证书",
  );
  const referenceOpened = page.waitForEvent("popup");
  await dialog
    .getByRole("link", { name: "查看完整证书规范（新标签页）" })
    .click();
  const reference = await referenceOpened;
  await expect(
    reference.getByRole("heading", {
      name: "连接地址、SNI 与证书身份",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    reference.getByRole("heading", {
      name: "名称不一致时如何处理",
      exact: true,
    }),
  ).toBeVisible();
  await expect(reference.locator(".identity-cases")).toContainText(
    "用 IP 连接，证书只有 DNS SAN",
  );
  await expect(reference.locator(".identity-cases")).toContainText(
    "CN 匹配，但已有 DNS SAN 均不匹配",
  );
  await expect(
    reference.getByRole("heading", {
      name: "示例：用 IP 连接，按域名认证",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    reference.locator("pre").filter({ hasText: "-verify_hostname" }),
  ).toContainText("-servername redis.example.com");
  await expect(
    reference.getByRole("link", { name: "OpenSSL 名称匹配规则" }),
  ).toHaveAttribute(
    "href",
    "https://docs.openssl.org/3.0/man3/X509_check_host/",
  );
  await reference.screenshot({
    path: "test-results/certificate-rules-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await reference.setViewportSize({ width: 390, height: 844 });
  await expect(reference.locator("aside.sidebar")).not.toBeInViewport();
  expect(
    await reference.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const treatment = reference
    .locator(".identity-cases tbody tr")
    .first()
    .locator('td[data-label="处理办法"]');
  await treatment.scrollIntoViewIfNeeded();
  const treatmentBox = await treatment.boundingBox();
  expect(treatmentBox.x).toBeGreaterThanOrEqual(0);
  expect(treatmentBox.x + treatmentBox.width).toBeLessThanOrEqual(390);
  await reference.evaluate(() => window.scrollTo(0, 0));
  await reference.screenshot({
    path: "test-results/certificate-rules-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await reference.close();
  await expect(dialog.getByLabel("隧道名称")).toHaveValue("pending-client");
  await expect(dialog.getByLabel("转发目标")).toHaveValue("10.0.0.8:6380");
  await expect(dialog.getByLabel("服务端证书身份")).toHaveValue(
    "redis.example.com",
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  for (const [label, section] of [
    ["部署说明", "部署步骤"],
    ["证书说明", "吊销与 CRL"],
    ["运维说明", "备份与恢复"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "工作台", exact: true }).click();
  await expect(page.getByRole("heading", { name: "最近的隧道" })).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("aside.sidebar")).not.toBeInViewport();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "证书管理", exact: true }).click();
  await page
    .getByRole("button", { name: "吊销 redis-server", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "确认操作" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("已吊销", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下载 redis-server 证书包" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await page
    .getByLabel("密码", { exact: true })
    .fill("integration-password-2026");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(
    page.getByRole("heading", { name: "证书管理", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "修改管理员密码" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("当前密码", { exact: true })
    .fill("integration-password-2026");
  await dialog
    .getByLabel("新密码", { exact: true })
    .fill("rotated-integration-password");
  await dialog
    .getByLabel("确认新密码", { exact: true })
    .fill("rotated-integration-password");
  await dialog.getByRole("button", { name: "更新密码" }).click();
  await expect(dialog).not.toBeVisible();
  expect(browserErrors).toEqual([]);
});
