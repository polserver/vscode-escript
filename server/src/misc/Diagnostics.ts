/**
 * Crash attribution helpers.
 *
 * The compiler runs synchronously on the server's only thread, so a native
 * failure takes the whole process down before any handler can report it. What
 * survives is whatever was written before the call started -- hence the
 * breadcrumb: the operation and document in flight are recorded up front, and
 * the crash handlers below print them on the way out.
 */

export type BreadcrumbPosition = {
    line: number;
    character: number;
};

type Breadcrumb = {
    operation: string;
    fsPath?: string;
    position?: BreadcrumbPosition;
    startedAt: number;
};

/**
 * At most one native call is ever in flight, so a single slot suffices.
 */
let current: Breadcrumb | undefined;

/**
 * Retained after completion so a crash that happens just *after* a native call
 * (during marshalling, or in a later microtask) still names the likely culprit.
 */
let previous: Breadcrumb | undefined;

export function beginOperation(operation: string, fsPath?: string, position?: BreadcrumbPosition): void {
    current = { operation, fsPath, position, startedAt: Date.now() };
}

export function endOperation(): void {
    if (current) {
        previous = current;
        current = undefined;
    }
}

function describe(breadcrumb: Breadcrumb | undefined, label: string): string | undefined {
    if (!breadcrumb) {
        return undefined;
    }
    const { operation, fsPath, position, startedAt } = breadcrumb;
    const where = fsPath ? ` ${fsPath}` : '';
    const at = position ? `:${position.line}:${position.character}` : '';
    return `${label}: ${operation}${where}${at} (${Date.now() - startedAt}ms ago)`;
}

/**
 * Human-readable description of what the server was doing, for crash reports.
 */
export function describeBreadcrumbs(): string {
    const parts = [
        describe(current, 'in flight'),
        describe(previous, 'previous')
    ].filter((part): part is string => typeof part === 'string');

    return parts.length ? parts.join('; ') : 'no operation recorded';
}

/**
 * Renders an unknown thrown value with its stack. Several call sites previously
 * interpolated errors into template strings, which calls `toString()` and drops
 * the stack -- exactly the information a crash report needs.
 */
export function formatError(e: unknown): string {
    if (e instanceof Error) {
        return e.stack ?? `${e.name}: ${e.message}`;
    }
    return String(e);
}

/**
 * Installs last-resort handlers. Without these, an unhandled rejection kills the
 * server silently on Node 15+, and a fatal error produces no diagnostic at all.
 *
 * Writes go straight to stderr rather than through the LSP connection: by the
 * time these run the connection may already be gone, and the client pipes the
 * server's stderr into its output channel regardless.
 */
export function installCrashHandlers(storageFsPath: string): void {
    const report = (kind: string, error: unknown) => {
        process.stderr.write(
            `[escript-lsp] ${kind}\n` +
            `[escript-lsp] ${describeBreadcrumbs()}\n` +
            `[escript-lsp] ${formatError(error)}\n`
        );
    };

    process.on('uncaughtException', (error) => {
        report('Uncaught exception; the language server will exit.', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        // Reported rather than rethrown: an unhandled rejection in a background
        // task (such as the workspace cache build) should not take down a server
        // that is otherwise serving requests fine.
        report('Unhandled promise rejection.', reason);
    });

    // Node's diagnostic report captures a *native* stack on fatal errors, which
    // is the only way to see where an abort inside the addon came from.
    try {
        process.report.directory = storageFsPath;
        process.report.filename = '';
        process.report.reportOnFatalError = true;
        process.stderr.write(
            `[escript-lsp] Fatal-error diagnostic reports will be written to ${storageFsPath}\n`
        );
    } catch (e) {
        process.stderr.write(`[escript-lsp] Could not enable diagnostic reports: ${formatError(e)}\n`);
    }
}
