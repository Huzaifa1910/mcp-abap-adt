import { McpError, ErrorCode } from '../lib/utils';
import {
    makeAdtRequest,
    return_error,
    getBaseUrl,
    activateObject,
    writeObjectSource
} from '../lib/utils';

/**
 * Create an ABAP interface via ADT.
 *
 * args:
 *   interface_name - required, e.g. "ZIF_HCM_EMPLOYEE"
 *   description    - required, short description
 *   source_code    - optional, full interface source. Default: empty interface.
 *   package        - optional, default "$TMP".
 *   transport      - optional, required for non-$TMP.
 *   activate       - optional, default true.
 */
export async function handleCreateInterface(args: any) {
    try {
        if (!args?.interface_name) {
            throw new McpError(ErrorCode.InvalidParams, 'interface_name is required');
        }
        if (!args?.description) {
            throw new McpError(ErrorCode.InvalidParams, 'description is required');
        }

        const name = String(args.interface_name).toUpperCase();
        const description = String(args.description);
        const pkg = String(args.package || '$TMP').toUpperCase();
        const transport = args.transport ? String(args.transport) : '';
        const sourceCode = typeof args.source_code === 'string' && args.source_code.length > 0
            ? args.source_code
            : `INTERFACE ${name.toLowerCase()}
  PUBLIC.
ENDINTERFACE.`;
        const doActivate = args.activate !== false;

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<intf:abapInterface xmlns:intf="http://www.sap.com/adt/oo/interfaces"
                    xmlns:adtcore="http://www.sap.com/adt/core"
                    adtcore:type="INTF/OI"
                    adtcore:name="${name}"
                    adtcore:description="${escapeXml(description)}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</intf:abapInterface>`;

        const baseUrl = await getBaseUrl();
        const createUrl = `${baseUrl}/sap/bc/adt/oo/interfaces`
            + (transport ? `?corrNr=${encodeURIComponent(transport)}` : '');

        const createResp = await makeAdtRequest(createUrl, 'POST', 60000, xml, undefined, {
            'Content-Type': 'application/vnd.sap.adt.oo.interfaces.v2+xml',
            'Accept': 'application/vnd.sap.adt.oo.interfaces.v2+xml'
        });

        const objectUri = `/sap/bc/adt/oo/interfaces/${encodeURIComponent(name.toLowerCase())}`;
        const log: string[] = [];
        log.push(`Interface ${name} created (HTTP ${createResp.status}).`);

        await writeObjectSource(objectUri, sourceCode);
        log.push('Source code uploaded.');

        if (doActivate) {
            const actResp = await activateObject(objectUri, name);
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

function escapeXml(s: string): string {
    return s.replace(/[<>&"']/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
    } as Record<string, string>)[c]);
}
