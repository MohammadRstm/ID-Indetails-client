import Icon from "@/shared/icons/Icon";
import { toggleTheme, useTheme } from "@/shared/theme";

/** Light / dark switch; shows where it takes you (sun in dark mode, moon in light mode). */
export default function ThemeToggle() {
    const dark = useTheme() === "dark";
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    return (
        <button className="icon-btn" onClick={toggleTheme} aria-label={label} title={label}>
            <Icon name={dark ? "sun" : "moon"} />
        </button>
    );
}
