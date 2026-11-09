import { useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "../api";
import type { Status } from "../api";
import { errorMessage } from "../format";
import { Brand, Field } from "./ui";
export function Login({
  status,
  onSuccess,
}: {
  status: Status;
  onSuccess: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(status.setup_required ? "/auth/setup" : "/auth/login", "POST", {
        username: f.get("username"),
        password: f.get("password"),
      });
      await onSuccess();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-card">
        <Brand />
        <form onSubmit={submit} className="auth-form">
          <h1>{status.setup_required ? "创建管理员" : "登录"}</h1>
          <Field label="用户名">
            <input
              name="username"
              autoComplete="username"
              defaultValue="admin"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_.\-]+"
              autoFocus
            />
          </Field>
          <Field
            label="密码"
            hint={status.setup_required ? "12–72 字节。" : undefined}
          >
            <input
              name="password"
              type="password"
              autoComplete={
                status.setup_required ? "new-password" : "current-password"
              }
              required
              minLength={status.setup_required ? 12 : 1}
              maxLength={72}
            />
          </Field>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary full" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={17} />}{" "}
            {status.setup_required ? "创建管理员" : "登录"}
          </button>
        </form>
      </div>
    </main>
  );
}
