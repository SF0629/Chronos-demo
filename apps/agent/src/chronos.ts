const CHRONOS_API_URL = process.env.CHRONOS_API_URL ?? "http://localhost:4000";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function sendEvent(event: object) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
            return;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (attempt === MAX_RETRIES) {
                console.error(
                    `[chronos] event send failed after ${MAX_RETRIES + 1} attempts: ${message}`,
                );
                return;
            }

            console.error(
                `[chronos] event send failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${message}`,
            );
            console.log(`[chronos] retrying in ${RETRY_DELAY_MS}ms`);

            await delay(RETRY_DELAY_MS);
        }
    }
}
