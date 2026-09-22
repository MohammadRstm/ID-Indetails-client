import { useEffect, useRef, useState } from "react"

export type useDebouncePropsType <T> = {
    debounceTimeMs : number;
    value : T;
}

const useDebounce = <T> ({
    debounceTimeMs,
    value,
} : useDebouncePropsType<T>) =>{

    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetTimeout = () =>{
        if(timeoutId.current)
            clearTimeout(timeoutId.current);
    }

    useEffect(() =>{
        resetTimeout();

        timeoutId.current = setTimeout(() =>{
            setDebouncedValue(value);
        } , debounceTimeMs);

        return () =>{
            resetTimeout();
        }
    } , [debounceTimeMs, value]);

    return debouncedValue;
}

export default useDebounce;