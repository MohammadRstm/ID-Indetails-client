import type { Dispatch, SetStateAction } from "react";
import type { FormErrors } from "../../types/generalTypes";

/**
 * 
 * @param setFormData setter for form data state
 * @param setErrors setter for validation errors 
 * 
 * @returns void
 * 
 * This generic function sets form data just like any "handleChange" function would
 * + it sets the error of the current field to undefined effectively removing the error display
 */

export const createFieldUpdater =
  <T>(setFormData: Dispatch<SetStateAction<T>>, setErrors: Dispatch<SetStateAction<FormErrors<T>>>) =>
  <K extends keyof T>(name: K, value: T[K]) =>{
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrors((prev) =>({// remove error message while typing
      ...prev,
      [name]: undefined
    }));
};