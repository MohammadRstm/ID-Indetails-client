import Select from "@/shared/components/Forms/Select";
import { useAccountLabels } from "./accountLabelsApi";
import { labelChoices } from "./labelChoices";

type AccountLabelSelectProps = {
    /** The chosen label's id as text, or "" for none. */
    value: string;
    onChange: (value: string) => void;
    /** The label the record already carries: kept on offer, marked archived once it is, so it isn't lost by saving. */
    own?: { id: number; name: string } | null;
    id?: string;
    "aria-label"?: string;
};

/** The company's account labels to file a payment under: the open ones, "No label", and the record's own archived one. */
export default function AccountLabelSelect({ value, onChange, own, ...rest }: AccountLabelSelectProps) {
    const labels = useAccountLabels();
    return <Select {...rest} value={value} onChange={onChange} options={labelChoices(labels.data, own)} />;
}
