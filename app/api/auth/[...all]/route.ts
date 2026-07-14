import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Endpoint do Better Auth (sign-in/up/out, sessão, organização, …).
export const { GET, POST } = toNextJsHandler(auth);
