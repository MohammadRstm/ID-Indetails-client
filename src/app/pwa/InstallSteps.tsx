import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { closeInstallSteps, useInstallStepsOpen } from "./install";

/** iOS has no install prompt: the app is added from the Share menu, so these are the steps. */
export default function InstallSteps() {
    const open = useInstallStepsOpen();
    if (!open) return null;
    return (
        <Modal
            title="Install ID-Indetails"
            sub="On an iPhone or iPad, the app is added from the Share menu."
            onClose={closeInstallSteps}
            foot={<><div className="grow" /><button className="btn btn-primary" onClick={closeInstallSteps}>Done</button></>}
        >
            <ol className="install-steps">
                <li>
                    <span className="install-step-n">1</span>
                    <div>Tap <b>Share</b> <Icon name="upload" /> at the bottom of Safari, or in its <b>•••</b> menu.</div>
                </li>
                <li>
                    <span className="install-step-n">2</span>
                    <div>Scroll down the list and tap <b>Add to Home Screen</b>.</div>
                </li>
                <li>
                    <span className="install-step-n">3</span>
                    <div>Tap <b>Add</b>, then open <b>ID-Indetails</b> from your Home Screen.</div>
                </li>
            </ol>
            <p className="muted mt">The app keeps its own sign-in, apart from Safari's, so you sign in once inside it. Already added it? Open it from your Home Screen.</p>
        </Modal>
    );
}
