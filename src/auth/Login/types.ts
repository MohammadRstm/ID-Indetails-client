import z from "zod";
import type { loginResponseSchema, loginSchema } from "./validation";

export type LoginFormDataType = z.infer<typeof loginSchema>;

export type LoginResponse = z.infer<typeof loginResponseSchema>;