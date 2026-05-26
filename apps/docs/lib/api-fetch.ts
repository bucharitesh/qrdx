"use client";

import { UnauthorizedError } from "@/types/errors";
import { handleUnauthorized } from "./handle-unauthorized";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status === 401) {
    await handleUnauthorized();
    throw new UnauthorizedError();
  }

  return response;
}
