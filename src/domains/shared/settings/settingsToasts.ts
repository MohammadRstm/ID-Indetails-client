import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";

/** What a saved setting says: it applies at once. */
export const saved = (text = "Setting saved", sub = "Applies straight away") => () => toast({ text, sub, icon: "checkCircle" });

/** A setting that wasn't saved, from a switch or a list with nowhere to say so beside it. */
export const notSaved = (e: unknown) => toast({ text: "The setting wasn't saved", sub: errorMessage(e), icon: "alert" });
