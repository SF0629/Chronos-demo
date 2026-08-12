const CHRONOS_API_URL = process.env.CHRONOS_API_URL ?? "http://localhost:4000";

export async function sendEvent(event: object) {
    try {
        const response = await fetch(`${CHRONOS_API_URL}/events`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
        });

        if (!response.ok) {
            throw new Error(
                `Chronos API responded with ${response.status} ${response.statusText}`,
            );
        }

        console.log("[chronos] event sent");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error(`[chronos] event send failed: ${message}`);
    }
}
