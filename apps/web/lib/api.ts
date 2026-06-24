const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function apiFetch(path: string, options?: RequestInit) {
    const res = await fetch(`${API_URL}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {})
        },
        ...options
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "API request failed");
    }

    return res.json();
}