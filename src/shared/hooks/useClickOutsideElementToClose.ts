import { useEffect } from "react";

const  useClickOutside = (
    ref: React.RefObject<HTMLElement | null>,
    onOutsideClick: () => void
) => {
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (
                ref.current &&
                !ref.current.contains(e.target as Node)
            ){
                onOutsideClick();
            }
        };

        document.addEventListener("mousedown", handleClick);

        return () =>
            document.removeEventListener("mousedown", handleClick);
    }, [ref, onOutsideClick]);
}

export default useClickOutside;

