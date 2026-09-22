import type { ChildrenPropsType } from "../types";

const ModalBody = ({children} : ChildrenPropsType) =>{

    return (
        <div className="modal-body">
            {children}
        </div>
    );
}

export default ModalBody;