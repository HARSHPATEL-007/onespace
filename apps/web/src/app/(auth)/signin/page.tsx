"use client";

import { useActionState } from "react";
import { Button, Card, Field, Input } from "@n0va/ui";
import { signInAction, type SignInState } from "./actions";

const initialState: SignInState = {};

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <Card className="nv-auth-card" padded>
      <form action={formAction}>
        <div className="nv-auth-logo">
          <span className="nv-sidebar-logo-mark">N</span>
          <span>N0VA Workspace</span>
        </div>
        <Field label="Email">
          <Input type="email" name="email" placeholder="you@company.com" required autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            name="password"
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </Field>
        {state.error ? (
          <p style={{ color: "var(--nv-color-danger)", fontSize: "var(--nv-font-sm)", marginBottom: 12 }}>
            {state.error}
          </p>
        ) : null}
        <Button type="submit" block size="lg" loading={pending}>
          Sign in
        </Button>
        <p
          style={{
            marginTop: 16,
            fontSize: "var(--nv-font-sm)",
            color: "var(--nv-color-text-muted)",
            textAlign: "center",
          }}
        >
          New to N0VA? <a className="nv-link" href="/signup">Create a workspace</a>
        </p>
      </form>
    </Card>
  );
}