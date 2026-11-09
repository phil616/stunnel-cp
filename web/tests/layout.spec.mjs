import { test, expect } from "@playwright/test";

const headers = { "X-CSRF-Protection": "1" };

test("响应式布局：操作可达、字段对齐及弹窗滚动", async ({ page, request }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  async function create(path, data) {
    const response = await request.post(`/api/${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  const ca = await create("authorities", {
    name: "Layout International Infrastructure Production Certificate Authority",
    organization: "Layout Tests",
    algorithm: "ECDSA-P256",
    days: 3650,
  });
  const cert = await create("certificates", {
    ca_id: ca.id,
    name: "layout-production-server-identity",
    common_name: "redis.production.example.com",
    purpose: "server",
    sans: [
      "redis.production.example.com",
      "redis-backup.production.example.com",
      "127.0.0.1",
      "::1",
    ],
    algorithm: "ECDSA-P256",
    days: 365,
  });
  const tunnel = await create("tunnels", {
    name: "layout-redis-production-secondary-region",
    mode: "server",
    accept: "[::1]:6380",
    connect: "redis-backend.production.example.com:6379",
    certificate_id: cert.id,
    peer_name: "",
    tls_min: "TLSv1.2",
    enabled: true,
  });
  async function go(route) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  async function screenshot(name, fullPage = false) {
    await page.screenshot({
      path: `test-results/layout/${name}.png`,
      fullPage,
      animations: "disabled",
    });
  }
  async function pageFits() {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  async function footerFits(dialog) {
    const footer = dialog.locator(".dialog-footer");
    const box = await footer.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    for (const button of await footer.getByRole("button").all())
      await expect(button).toBeInViewport({ ratio: 1 });
    const content = await dialog.locator(".dialog-content").boundingBox();
    expect(content.y + content.height).toBeLessThanOrEqual(box.y + 1);
  }
  async function close(dialog) {
    await dialog
      .getByRole("button", { name: "关闭对话框", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "放弃未保存的修改？",
      exact: true,
    });
    if (await confirm.isVisible())
      await confirm
        .getByRole("button", { name: "放弃修改", exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
  }

  // A table must retain all actions without horizontal scrolling at desktop widths.
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["tunnels", "certificates", "audit"]) {
      await go(route);
      await pageFits();
      expect(
        await page
          .locator(".table-scroll")
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBeTruthy();
    }
  }
  // Desktop inputs with descriptions must align with their neighbouring inputs.
  await page.setViewportSize({ width: 1440, height: 900 });
  await go("overview");
  const values = await page
    .locator(".stat-card > strong")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().top),
    );
  expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  const recent = page.locator(".recent-tunnels");
  expect(
    await recent.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBeTruthy();
  await screenshot("overview-desktop", true);
  await go("certificates");
  await page
    .getByRole("button", { name: "签发证书", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog", { name: "签发证书", exact: true });
  const algorithm = await dialog.getByLabel("密钥算法").boundingBox();
  const days = await dialog
    .getByLabel("有效期（天）", { exact: true })
    .boundingBox();
  expect(Math.abs(algorithm.y - days.y)).toBeLessThanOrEqual(1);
  await footerFits(dialog);
  await screenshot("certificate-desktop");
  await close(dialog);

  for (const [name, width, height] of [
    ["laptop", 1120, 800],
    ["tablet", 820, 1000],
    ["mobile", 390, 844],
    ["small", 320, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await go("tunnels");
    await pageFits();
    const scroller = page.locator(".table-scroll");
    expect(
      await scroller.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBeTruthy();
    for (const action of [
      `预览 ${tunnel.name}`,
      `编辑 ${tunnel.name}`,
      `下载 ${tunnel.name} 部署包`,
      `删除 ${tunnel.name}`,
    ]) {
      const button = page.getByRole("button", { name: action, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport({ ratio: 1 });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await screenshot(`tunnels-${name}`, true);
    await go("authorities");
    await pageFits();
    const card = page.locator(".ca-card").filter({ hasText: ca.name });
    const caButton = card.getByRole("button", { name: "CA 证书", exact: true });
    const crlButton = card.getByRole("button", {
      name: "吊销列表",
      exact: true,
    });
    const caBox = await caButton.boundingBox(),
      crlBox = await crlButton.boundingBox();
    expect(Math.abs(caBox.y - crlBox.y)).toBeLessThanOrEqual(1);
    expect(crlBox.x - (caBox.x + caBox.width)).toBeGreaterThanOrEqual(8);
    await screenshot(`authorities-${name}`, true);
    await go("certificates");
    await page
      .getByRole("button", { name: "签发证书", exact: true })
      .first()
      .click();
    dialog = page.getByRole("dialog", { name: "签发证书", exact: true });
    await footerFits(dialog);
    if (width <= 600) {
      const fields = dialog.locator(".form-grid").first().locator(":scope > *");
      const first = await fields.nth(0).boundingBox(),
        second = await fields.nth(1).boundingBox();
      expect(second.y - (first.y + first.height)).toBeGreaterThanOrEqual(12);
    }
    await screenshot(`certificate-${name}`);
    await close(dialog);
    await page
      .getByRole("button", { name: `查看 ${cert.name} 详情`, exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: cert.name, exact: true });
    await footerFits(dialog);
    await dialog.locator(".dialog-content").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await footerFits(dialog);
    await expect(
      dialog.getByRole("button", { name: "复制证书指纹", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await screenshot(`detail-${name}`);
    await close(dialog);
    await go("tunnels");
    await page
      .getByRole("button", { name: "新建隧道", exact: true })
      .first()
      .click();
    dialog = page.getByRole("dialog", { name: "新建隧道配置", exact: true });
    await dialog
      .locator("label")
      .filter({ hasText: /^客户端$/ })
      .click();
    await dialog.locator("summary").click();
    await footerFits(dialog);
    const before = await dialog.locator(".dialog-footer").boundingBox();
    await dialog.locator(".dialog-content").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const after = await dialog.locator(".dialog-footer").boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await footerFits(dialog);
    await screenshot(`client-form-${name}`);
    await close(dialog);
    await go("audit");
    await pageFits();
    expect(
      await page
        .locator(".table-scroll")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
