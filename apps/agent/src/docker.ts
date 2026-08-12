import Docker from "dockerode";
import { sendEvent } from "./chronos.js";

const docker = new Docker({
    socketPath: "//./pipe/docker_engine",
});

const RECONNECT_DELAY_MS = 3000;

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const supportedActions = ["start", "stop", "die", "restart"];

type DockerEvent = {
    Type: string;
    Action: string;
    Actor: {
        ID: string;
        Attributes: Record<string, string>;
    };
    time: number;
    timeNano?: number;
};

function scheduleReconnect(reason: string) {
    if (reconnectTimer) {
        return;
    }

    console.error(
        `[docker] ${reason}. reconnecting in ${RECONNECT_DELAY_MS}ms`,
    );

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void startDockerCollector();
    }, RECONNECT_DELAY_MS);
}

export async function startDockerCollector() {
    try {
        const stream = await docker.getEvents({
            filters: {
                type: ["container"],
            },
        });

        console.log("[docker] event stream connected");

        let buffer = "";

        stream.on("data", (chunk: Buffer) => {
            buffer += chunk.toString("utf8");

            const lines = buffer.split("\n");

            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.trim()) {
                    continue;
                }

                let dockerEvent: DockerEvent;

                try {
                    dockerEvent = JSON.parse(line) as DockerEvent;
                } catch (error) {
                    console.error(`[docker] invalid event JSON: ${error}`);
                    continue;
                }

                if (!supportedActions.includes(dockerEvent.Action)) {
                    continue;
                }

                const serviceId =
                    dockerEvent.Actor.Attributes["chronos.service_id"];

                if (!serviceId) {
                    continue;
                }

                const containerName = dockerEvent.Actor.Attributes["name"];

                const image = dockerEvent.Actor.Attributes["image"];

                const occurredAt = dockerEvent.timeNano
                    ? new Date(dockerEvent.timeNano / 1_000_000).toISOString()
                    : new Date(dockerEvent.time * 1000).toISOString();

                const chronosEvent = {
                    serviceId,
                    source: "docker",
                    type: `docker.container.${dockerEvent.Action}`,
                    title: `${containerName} container ${dockerEvent.Action}`,
                    occurredAt,
                    sourceEventId: `docker:${dockerEvent.Actor.ID}:${dockerEvent.Action}:${dockerEvent.timeNano ?? dockerEvent.time}`,
                    metadata: {
                        containerId: dockerEvent.Actor.ID,
                        containerName,
                        image,
                        action: dockerEvent.Action,
                    },
                };

                void sendEvent(chronosEvent);
            }
        });

        stream.on("error", (error) => {
            scheduleReconnect(`stream error: ${error.message}`);
        });

        stream.on("end", () => {
            scheduleReconnect("stream ended");
        });

        stream.on("close", () => {
            scheduleReconnect("stream closed");
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        scheduleReconnect(`connection failed: ${message}`);
    }
}
