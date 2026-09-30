import z from "zod";

export const loginSchema = z.object({
    username: z
            .string()
            .trim()
            .min(2 , "Username must be atleast 2 charachters long"),

    password:z
            .string()
            .trim()
            .min(8 , "Password must be atleast 8 characters long"),
});

export const loginResponseSchema = z.object({
    token: z.string(),

    user:z.object({
        id: z.number(),
        firstname: z.string(),
        lastname: z.string(),
        username: z.string(),
    }),
});