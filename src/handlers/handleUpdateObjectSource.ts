import { McpError, ErrorCode } from '../lib/utils';
import {
    return_error,
    activateObject,
    writeObjectSource
} from '../lib/utils';

/**
 * Push new source code to an existing ADT object (lock + PUT + unlock).
 * Useful for replication: read source from one system via Get*, then write
 * here on another system after the shell object exists.
 *
 * args:
 *   object_uri  - required, e.g. "/sap/bc/adt/programs/programs/zhello"
 *                 or "/sap/bc/adt/oo/classes/zcl_demo"
 *   object_name - required, uppercase name of the object (used for activation log)
 *   source_code - required, full source text to write
 *   activate    - optional, default true
 */
export async function handleUpdateObjectSource(args: any) {
    try {
        if (!args?.object_uri) {
            throw new McpError(ErrorCode.InvalidParams, 'object_uri is required');
        }
        if (!args?.object_name) {
            throw new McpError(ErrorCode.InvalidParams, 'object_name is required');
        }
        if (typeof args?.source_code !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'source_code is required');
        }

        const objectUri = String(args.object_uri);
        const objectName = String(args.object_name).toUpperCase();
        const sourceCode = String(args.source_code);
        const doActivate = args.activate !== false;

        const log: string[] = [];
        await writeObjectSource(objectUri, sourceCode);
        log.push(`Source written to ${objectUri}.`);

        if (doActivate) {
            const actResp = await activateObject(objectUri, objectName);
            const actBody = String(actResp.data || '');
            log.push(`Activation HTTP ${actResp.status}.`);
            if (actBody.trim()) log.push(`Activation messages:\n${actBody}`);
        }

        return {
            isError: false,
            content: [{ type: 'text', text: log.join('\n') }]
        };
    } catch (error) {
        return return_error(error);
    }
}
