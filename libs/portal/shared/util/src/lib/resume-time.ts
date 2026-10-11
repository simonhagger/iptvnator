/** Shared elapsed time label for explicit resume actions. */
export function formatResumeTime(seconds: number): string {
    const total = Number.isFinite(seconds)
        ? Math.max(0, Math.floor(seconds))
        : 0;
    const hours = Math.floor(total / 3600);
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const remainder = String(total % 60).padStart(2, '0');
    return hours
        ? `${String(hours).padStart(2, '0')}:${minutes}:${remainder}`
        : `${minutes}:${remainder}`;
}
