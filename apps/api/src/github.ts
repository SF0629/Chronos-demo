import { createHmac, timingSafeEqual } from "node:crypto";

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
