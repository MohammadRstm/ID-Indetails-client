import type { ChildrenPropsType } from "../types";

const ModalFooter = ({children} : ChildrenPropsType) =>{

    return (
        <div className="modal-footer">
            {children}
        </div>
    );
}

export default ModalFooter;