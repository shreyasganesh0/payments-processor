import { Provider, Type } from '@nestjs/common';

// Select a Nest provider implementation by a config key, failing fast at boot
// with the known keys if the key is unregistered. This is the plug-point for
// swappable adapters (bank today; notifier/auth later): a new implementation is
// one registry entry + one env value, with zero changes at the injection sites.
export function selectProvider<T>(
    token: string | symbol,
    registry: Record<string, Type<T>>,
    key: string,
): Provider {
    const impl = registry[key];
    if (!impl) {
        throw new Error(
            `No provider registered for ${String(token)}="${key}". ` +
                `Known: ${Object.keys(registry).join(', ')}`,
        );
    }
    return { provide: token, useClass: impl };
}
