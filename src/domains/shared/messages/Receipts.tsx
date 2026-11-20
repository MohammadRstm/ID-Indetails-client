import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import Modal from "@/shared/components/Overlays/Modal";
import { fmtTime, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { loadFailed } from "@/api/queryState";
import { useMessageReceipts, type Receipt, type Receipts } from "./messagesApi";
import { seenWords } from "./receiptWords";

const TICKS: Record<Receipt["status"], string> = { sent: "Sent", delivered: "Delivered", read: "Read" };

/**
 * A message's ticks, for those who see them: one grey once sent, two grey once everyone it is for has received it,
 * two blue once all of them have read it. Pressing them shows who.
 */
export function Ticks({ receipt, onOpen }: { receipt: Receipt; onOpen: () => void }) {
    const words = receipt.of > 1 ? `${TICKS[receipt.status]} · ${seenWords(receipt)}` : TICKS[receipt.status];
    return (
        <button type="button" className={cx("msg-ticks", receipt.status)} aria-label={words} title={words} onClick={onOpen}>
            <Icon name={receipt.status === "sent" ? "check" : "checks"} />
        </button>
    );
}

/** Under the newest message of a team chat or Announcements: whose faces have seen it, and how many of how many. */
export function SeenBy({ messageId, receipt, mine, onOpen }: { messageId: number; receipt: Receipt; mine: boolean; onOpen: () => void }) {
    const receipts = useMessageReceipts(messageId);
    const faces = (receipts.data?.seen ?? []).slice(0, 4);
    return (
        <button type="button" className={cx("msg-seen-by", mine && "mine")} onClick={onOpen}>
            {faces.length > 0 && (
                <span className="msg-seen-faces" aria-hidden="true">
                    {faces.map((p) => <Avatar key={p.id} person={{ name: p.name, photoFileId: p.photoFileId }} size={16} />)}
                </span>
            )}
            {seenWords(receipt)}
            <Icon name="chevronRight" />
        </button>
    );
}

const when = (at: string) => `${relDay(at)} at ${fmtTime(at)}`;

function People({ title, hint, people, empty }: { title: string; hint?: string; people: Receipts["seen"]; empty: string }) {
    return (
        <div className="receipt-sec">
            <div className="receipt-sec-head">
                <b>{title}</b><span className="muted num">{people.length}</span>
                {hint && <span className="muted grow" style={{ textAlign: "right", fontSize: 11 }}>{hint}</span>}
            </div>
            {people.length === 0 ? <div className="muted receipt-empty">{empty}</div> : people.map((p) => (
                <div key={p.id} className="receipt-row">
                    <Avatar person={{ name: p.name, photoFileId: p.photoFileId }} size={26} />
                    <span className="grow trunc">{p.name}</span>
                    {p.at && <span className="muted mono receipt-at">{when(p.at)}</span>}
                </div>
            ))}
        </div>
    );
}

/** Who has seen a message, who has received it without reading it yet, and who hasn't received it. */
export function ReceiptsModal({ messageId, onClose }: { messageId: number; onClose: () => void }) {
    const receipts = useMessageReceipts(messageId);
    const r = receipts.data;
    return (
        <Modal size="sm" title="Message info" sub={r ? seenWords(r.summary) : undefined} onClose={onClose}>
            {loadFailed(receipts) ? <LoadError error={receipts.error} retry={() => receipts.refetch()} what="who has seen it" />
                : !r ? <SkeletonLines lines={5} /> : (
                    <>
                        <People title="Seen" people={r.seen} empty="Nobody yet" />
                        <People title="Delivered" hint="Received, not read yet" people={r.delivered} empty="Nobody" />
                        <People title="Not received yet" people={r.notReceived} empty="Everyone has it" />
                    </>
                )}
        </Modal>
    );
}
