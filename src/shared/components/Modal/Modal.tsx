import "./Modal.css";
import type React from "react";
import ModalBody from "./compounds/ModalBody";
import ModalFooter from "./compounds/ModalFooter";
import ModalHeader from "./compounds/ModalHeader";
import { useRef } from "react";
import useClickOutside from "../../hooks/useClickOutsideElementToClose";

export type ModalPropsType = {
    children : React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
};


const Modal = ({children , isOpen , onClose} : ModalPropsType) =>{
    const modalRef =   useRef<HTMLDivElement>(null);

    useClickOutside(modalRef , onClose);
    
    if(!isOpen) return;

    return(
        <div className="modal-backdrop">
            <div
                ref={modalRef}
                className="modal-container"
            >
                <button
                    className="modal-cancel-button"
                    onClick={onClose}
                    aria-label="Close modal"
                >
                    ×
                </button>

                {children}
            </div>
        </div>
    );
}

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;