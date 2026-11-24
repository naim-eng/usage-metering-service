import { isIP } from "node:net";
import type { Express } from "express";

function isValidProxyAddress(value: string): boolean {
    if (isIP(value) !== 0) {
        return true;
    }

    const parts = value.split("/");

    if (parts.length !== 2) {
        return false;
    }

    const [address, prefix] = parts;
    const version = isIP(address);

    if (version === 0 || !/^\d+$/.test(prefix)) {
        return false;
    }

    const prefixLength = Number(prefix);
    const maximumPrefix = version === 4 ? 32 : 128;

    return (
        Number.isInteger(prefixLength) &&
        prefixLength >= 1 &&
        prefixLength <= maximumPrefix
    );
}

export function configureTrustedProxy(
    app: Express,
    value: string | undefined = process.env.TRUST_PROXY
): void {
    const setting = value?.trim();

    if (!setting || setting.toLowerCase() === "false") {
        app.set("trust proxy", false);
        return;
    }

    if (setting.toLowerCase() === "true") {
        throw new Error(
            "TRUST_PROXY=true is not permitted. Configure explicit trusted proxy addresses or CIDR ranges."
        );
    }

    if (/^\d+$/.test(setting)) {
        throw new Error(
            "Numeric TRUST_PROXY hop counts are not permitted."
        );
    }

    const entries = setting
        .split(",")
        .map(entry => entry.trim());

    if (entries.some(entry => !isValidProxyAddress(entry))) {
        throw new Error(
            "TRUST_PROXY must contain only valid IP addresses or CIDR ranges."
        );
    }

    app.set("trust proxy", entries);
}
