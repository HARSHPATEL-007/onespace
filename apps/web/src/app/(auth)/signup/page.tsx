"use client";

import { useActionState } from "react";
import { Button, Card, Field, Input } from "@n0va/ui";
import { signUpAction, type SignUpState } from "./actions";

const initialState: SignUpState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <Card className="nv-auth-card" padded>
      <form action={formAction}>
        <div className="nv-auth-logo">
          <span className="nv-sidebar-logo-mark">N</span>
          <span>N0VA Workspace</span>
        </div>
        <Field label="Your name">
          <Input name="name" placeholder="Jane Doe" required autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input type="email" name="email" placeholder="you@company.com" required autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            name="password"
            placeholder="At least 8 characters"
            required
            autoComplete="new-password"
          />
        </Field>
        <Field label="Workspace name">
          <Input name="workspaceName" placeholder="Acme Inc" required />
        </Field>
        {state.error ? (
          <p style={{ color: "var(--nv-color-danger)", fontSize: "var(--nv-font-sm)", marginBottom: 12 }}>
            {state.error}
          </p>
        ) : null}
        <Button type="submit" block size="lg" loading={pending}>
          Create workspace
        </Button>
        <p
          style={{
            marginTop: 16,
            fontSize: "var(--nv-font-sm)",
            color: "var(--nv-color-text-muted)",
            textAlign: "center",
          }}
        >
          Already have an account? <a className="nv-link" href="/signin">Sign in</a>
        </p>
      </form>
    </Card>
  );
}