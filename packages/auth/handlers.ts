import "server-only";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "./server";
export const { POST, GET } = toNextJsHandler(auth);
