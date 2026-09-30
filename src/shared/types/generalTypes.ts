export interface User{
    firstname: string,
    lastname: string,

    username: string,
    id: number,
    role: string
};

export type FormErrors<T> = Partial<Record<keyof T, string>>;

