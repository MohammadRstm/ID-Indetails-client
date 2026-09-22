import z, { ZodType } from "zod";
import type { Dispatch, SetStateAction } from "react";
import type { FormErrors } from "../../types/generalTypes";

interface validateFormParamType<T>{
    schema : ZodType<T>,
    formData: T,
    setErrors: Dispatch<SetStateAction<FormErrors<T>>>
};

/**
 * 
 * @param schema - ZOD schema for the form
 * @param formData - the form's data state
 * @param setErrors - takes the first error for every field in the form and sets them for display
 * 
 * @returns true if form is valid | flase if form is not
 */

const validateForm = <T>({ schema , formData , setErrors} : validateFormParamType<T>) =>{
   
    const result = schema.safeParse(formData);


    if(!result.success){
        const fieldErrors = z.flattenError(result.error).fieldErrors;

        const errors: FormErrors<T> = {};

        for (const key in fieldErrors) {
            const typedKey = key as keyof T;
            errors[typedKey] = fieldErrors[typedKey]?.[0];
        }

        setErrors(errors);

        return false;
    }

    return true;
}

export default validateForm;