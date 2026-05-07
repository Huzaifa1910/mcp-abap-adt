import { McpError, ErrorCode } from '../lib/utils';
import {
    makeAdtRequest,
    return_error,
    getBaseUrl,
    lockObject,
    unlockObject,
    resetSession
} from '../lib/utils';

/**
 * Delete an ADT object (DELETE /sap/bc/adt/<uri>).
 * For most ADT object types SAP requires a lock before delete.
 *
 * args:
 *   object_uri - required, e.g. "/sap/bc/adt/oo/classes/zcl_demo"
 *   transport  - optional, transport request (required for non-$TMP objects)
 *   skip_lock  - optional, default false. Set true for objects that don't
 *                support the lock action (e.g. some packages).
 */
export async function handleDeleteObject(args: any) {
    try {
        if (!args?.object_uri) {
            throw new McpError(ErrorCode.InvalidParams, 'object_uri is required');
        }
        const objectUri = String(args.object_uri);
        const transport = args.transport ? String(args.transport) : '';
        const skipLock = args.skip_lock === true;

        const log: string[] = [];
        let lockHandle = '';

        if (!skipLock) {
            // Lock must succeed — SAP requires lockHandle on DELETE for most types.
            lockHandle = await lockObject(objectUri);
            log.push(`Acquired lock handle "${lockHandle}".`);
        }

        try {
            const baseUrl = await getBaseUrl();
            const url = `${baseUrl}${objectUri}`
                + (lockHandle ? `?lockHandle=${encodeURIComponent(lockHandle)}` : '')
                + (transport ? `${lockHandle ? '&' : '?'}corrNr=${encodeURIComponent(transport)}` : '');

            const resp = await makeAdtRequest(url, 'DELETE', 60000, undefined, undefined, {
                'X-sap-adt-sessiontype': 'stateful'
            });
            log.push(`Deleted ${objectUri} (HTTP ${resp.status}).`);
            const body = String(resp.data || '');
            if (body.trim()) log.push(`Server response:\n${body.slice(0, 500)}`);
        } finally {
            if (lockHandle) {
                try { await unlockObject(objectUri, lockHandle); } catch { /* ignore */ }
            }
            resetSession();
        }

        return {
            isError: false,
            content: [{ type: 'text', text: log.join('\n') }]
        };
    } catch (error) {
        return return_error(error);
    }
}
