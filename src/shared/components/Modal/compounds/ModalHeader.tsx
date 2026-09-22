import type { ChildrenPropsType } from "../types";

const ModalHeader = ({children} : ChildrenPropsType) =>{

    return (
        <div className="modal-header">
            {children}
        </div>
    );
}

export default ModalHeader;