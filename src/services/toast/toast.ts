import { toast } from "sonner";
import { DURATIONS } from "./constants";

const notify = {
    success(message: string, duration: number = DURATIONS.normal) {
        toast.success(message, {
            duration: duration,
        });
    },

    error(message: string,  duration: number = DURATIONS.normal) {
        toast.error(message ,{
            duration: duration,
        });
    },

    info(message: string,  duration: number = DURATIONS.normal) {
        toast.info(message,{
            duration: duration,
        });
    },

    warning(message: string,  duration: number = DURATIONS.normal) {
        toast.warning(message,{
            duration: duration,
        });
    },

    loading(message: string,  duration: number = DURATIONS.normal) {
        return toast.loading(message,{
            duration: duration,
        });
    },

    dismiss(id?: string | number) {
        toast.dismiss(id);
    },

    promise: toast.promise,
};

export default notify;