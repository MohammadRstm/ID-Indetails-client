export interface User{
    firstname: string,
    lastname: string,

    username: string,
    id: number
};

export type FormErrors<T> = Partial<Record<keyof T, string>>;

