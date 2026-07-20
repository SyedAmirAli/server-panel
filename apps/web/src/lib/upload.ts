import { getToken } from "@/lib/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export interface UploadHandle<T> {
    /** Resolves with the unwrapped response data, or rejects on error/abort. */
    promise: Promise<T>;
    /** Abort the in-flight upload. */
    cancel: () => void;
}

/**
 * Multipart upload with byte-level progress via XHR (the JSON `api()` helper
 * can't do FormData or progress). Auth uses the admin JWT.
 */
export function uploadWithProgress<T>(
    path: string,
    form: FormData,
    onProgress?: (pct: number, loaded: number, total: number) => void
): UploadHandle<T> {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<T>((resolve, reject) => {
        xhr.open("POST", `${BASE_URL}${path}`);
        const token = getToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
            }
        };

        xhr.onload = () => {
            let payload: any = null;
            try {
                payload = JSON.parse(xhr.responseText);
            } catch {
                /* non-JSON */
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                // Unwrap the { status, message, data } envelope.
                resolve(payload && "data" in payload ? (payload.data as T) : (payload as T));
            } else {
                reject(new Error(payload?.message || `Upload failed (${xhr.status})`));
            }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => reject(new Error("Upload cancelled"));
        xhr.send(form);
    });

    return { promise, cancel: () => xhr.abort() };
}
