import { createHmac, timingSafeEqual } from "node:crypto";

export type GitHubPushPayload = {
    ref: string;
    before: string;
    after: string;
    repository: {
        name: string;
        full_name: string;
        html_url: string;
    };

    pusher: {
        name: string;
        email: string;
    };

    forced: boolean;
    compare: string;

    head_commit: {
        id: string;
        message: string;
        timestamp: string;
        url: string;
    } | null;
};

export function verifyGitHubSignature(
    payload: Buffer,
    signature: string,
    secret: string,
) {
    const expectedSignature =
        "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureBuffer = Buffer.from(signature);

    if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
    }

    return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function normalizeGitHubPush(
    payload: GitHubPushPayload,
    deliveryId: string,
    serviceId: string,
) {
    if (!payload.head_commit) {
        return;
    }

    if (!payload.ref.startsWith("refs/heads/")) {
        return;
    }

    const branch = payload.ref.replace("refs/heads/", "");

    const chronosEvent = {
        serviceId,
        source: "github",
        type: "github.push",
        title: `${payload.repository.full_name} ${branch} branch pushed`,
        occurredAt: payload.head_commit.timestamp,
        sourceEventId: deliveryId,
        metadata: {
            repository: payload.repository.full_name,
            ref: payload.ref,
            before: payload.before,
            after: payload.after,
            pusher: payload.pusher.name,
            forced: payload.forced,
            compare: payload.compare,
            headCommitId: payload.head_commit.id,
            headCommitMessage: payload.head_commit.message,
            headCommitUrl: payload.head_commit.url,
        },
    };

    return chronosEvent;
}
