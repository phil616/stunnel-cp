import { useRef, useState } from "react";
import {
  Alert,
  Button,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { api } from "../api";
import type { Status } from "../api";
import { errorMessage } from "../format";
import { Brand } from "./ui";
export function Login({
  status,
  onSuccess,
}: {
  status: Status;
  onSuccess: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false);
  const form = useForm({ initialValues: { username: "admin", password: "" } });
  return (
    <main className="login-page">
      <div className="login-card">
        <Brand />
        <form
          onSubmit={form.onSubmit(async (values) => {
            if (submitting.current) return;
            submitting.current = true;
            setBusy(true);
            setError("");
            try {
              await api(
                status.setup_required ? "/auth/setup" : "/auth/login",
                "POST",
                values,
              );
              await onSuccess();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              submitting.current = false;
              setBusy(false);
            }
          })}
        >
          <Stack>
            <Title order={1} size="h2">
              {status.setup_required ? "创建管理员" : "登录"}
            </Title>
            <TextInput
              label="用户名"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              pattern={"[a-zA-Z0-9_.\\-]+"}
              autoFocus
              disabled={busy}
              {...form.getInputProps("username")}
            />
            <PasswordInput
              label="密码"
              description={status.setup_required ? "12–72 字节" : undefined}
              autoComplete={
                status.setup_required ? "new-password" : "current-password"
              }
              required
              minLength={status.setup_required ? 12 : 1}
              maxLength={72}
              disabled={busy}
              {...form.getInputProps("password")}
            />
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            <Button type="submit" loading={busy} fullWidth>
              {status.setup_required ? "创建管理员" : "登录"}
            </Button>
          </Stack>
        </form>
      </div>
    </main>
  );
}
