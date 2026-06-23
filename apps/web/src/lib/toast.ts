import { toast, type ToastOptions } from 'react-toastify';

const defaults: ToastOptions = { autoClose: 4000 };

export function toastError(message: string, options?: ToastOptions) {
  toast.error(message, { ...defaults, ...options });
}

export function toastSuccess(message: string, options?: ToastOptions) {
  toast.success(message, { ...defaults, ...options });
}

export function toastInfo(message: string, options?: ToastOptions) {
  toast.info(message, { ...defaults, ...options });
}
