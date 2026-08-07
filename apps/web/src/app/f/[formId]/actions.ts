"use server";

import { submitPublicResponse } from "@n0va/modules-forms/server";

export async function submitFormResponse(
  formId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  await submitPublicResponse(formId, answers);
}
