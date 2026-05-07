import { McpError, ErrorCode } from '../lib/utils';
import {
    return_error,
    tryReleaseObjectLocks,
    unlockObject,
    resetSession
} from '../lib/utils';

/**
 * Best-effort lock release for an ADT object.
 *
 * args:
 *   object_uri  - required, e.g. "/sap/bc/adt/oo/classes/zcl_demo"
 *   lock_handle - optional. If present, sends a targeted UNLOCK with that
 *                 handle. If absent, attempts a session-scoped release.
 *
 * Notes:
 *   SAP enqueue locks are session-bound. A lock acquired in another (now-
 *   dead) session can ONLY be released by:
 *     - the original session (impossible if it's gone),
 *     - SM12 admin,
 *     - waiting for SAP's enqueue timeout (~30 min).
 *   This tool tries the standard ADT release pathway and reports the
 *   server response so callers know whether the lock is gone.
 */
export async function handleUnlockObject(args: any) {
    try {
        if (!args?.object_uri) {
            throw new McpError(ErrorCode.InvalidParams, 'object_uri is required');
        }
        const objectUri = String(args.object_uri);
        const lockHandle = args.lock_handle ? String(args.lock_handle) : '';

        const log: string[] = [];

        // Always reset local cookies first so we don't piggy-back a bad session.
        resetSession();

        if (lockHandle) {
            await unlockObject(objectUri, lockHandle);
            log.push(`UNLOCK with handle "${lockHandle}" sent.`);
        } else {
            const r = await tryReleaseObjectLocks(objectUri);
            log.push(`UNLOCK (no handle) sent. HTTP ${r.status}.`);
            if (r.body.trim()) log.push(`Server response:\n${r.body}`);
            else log.push('Server returned an empty body — request accepted.');
        }

        log.push('');
        log.push('Note: SAP enqueue locks are session-bound. If this object ' +
                 'was locked in a different (dead) session, this call is a ' +
                 'no-op and the lock will only clear via SM12 admin or after ' +
                 'the enqueue timeout (~30 min).');

        return {
            isError: false,
            content: [{ type: 'text', text: log.join('\n') }]
        };
    } catch (error) {
        return return_error(error);
    }
}
