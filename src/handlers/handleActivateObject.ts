import { McpError, ErrorCode } from '../lib/utils';
import { activateObject, return_error } from '../lib/utils';

/**
 * Activate an existing ADT object. Activation messages (errors/warnings) are
 * returned in the body — HTTP 200 does not imply successful activation.
 *
 * args:
 *   object_uri  - required, e.g. "/sap/bc/adt/programs/programs/zhello"
 *   object_name - required, uppercase name (e.g. "ZHELLO")
 */
export async function handleActivateObject(args: any) {
    try {
        if (!args?.object_uri) {
            throw new McpError(ErrorCode.InvalidParams, 'object_uri is required');
        }
        if (!args?.object_name) {
            throw new McpError(ErrorCode.InvalidParams, 'object_name is required');
        }

        const objectUri = String(args.object_uri);
        const objectName = String(args.object_name).toUpperCase();

        const resp = await activateObject(objectUri, objectName);
        const body = String(resp.data || '');
        const log = [`Activation HTTP ${resp.status}.`];
        if (body.trim()) log.push(`Activation messages:\n${body}`);

        return {
            isError: false,
            content: [{ type: 'text', text: log.join('\n') }]
        };
    } catch (error) {
        return return_error(error);
    }
}
