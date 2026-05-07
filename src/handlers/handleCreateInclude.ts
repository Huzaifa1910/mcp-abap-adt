import { McpError, ErrorCode } from '../lib/utils';
import {
    makeAdtRequest,
    return_error,
    getBaseUrl,
    activateObject,
    writeObjectSource
} from '../lib/utils';

/**
 * Create a standalone ABAP program include (PROG/I) via ADT.
 *
 * args:
 *   include_name - required, e.g. "ZINC_HELLO"
 *   description  - required, short description
 *   source_code  - optional. Default: minimal include skeleton.
 *   package      - optional, default "$TMP".
 *   transport    - optional, required for non-$TMP packages.
 *   activate     - optional, default true.
 */
export async function handleCreateInclude(args: any) {
    try {
        if (!args?.include_name) {
            throw new McpError(ErrorCode.InvalidParams, 'include_name is required');
        }
        if (!args?.description) {
            throw new McpError(ErrorCode.InvalidParams, 'description is required');
        }

        const name = String(args.include_name).toUpperCase();
        const description = String(args.description);
        const pkg = String(args.package || '$TMP').toUpperCase();
        const transport = args.transport ? String(args.transport) : '';
        const sourceCode = typeof args.source_code === 'string' && args.source_code.length > 0
            ? args.source_code
            : `*&---------------------------------------------------------------------*
*& Include  ${name}
*&---------------------------------------------------------------------*
`;
        const doActivate = args.activate !== false;

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes"
                     xmlns:adtcore="http://www.sap.com/adt/core"
                     adtcore:type="PROG/I"
                     adtcore:name="${name}"
                     adtcore:description="${escapeXml(description)}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</include:abapInclude>`;

        const baseUrl = await getBaseUrl();
        const createUrl = `${baseUrl}/sap/bc/adt/programs/includes`
            + (transport ? `?corrNr=${encodeURIComponent(transport)}` : '');

        const createResp = await makeAdtRequest(createUrl, 'POST', 60000, xml, undefined, {
            'Content-Type': 'application/vnd.sap.adt.programs.includes.v2+xml',
            'Accept': 'application/vnd.sap.adt.programs.includes.v2+xml'
        });

        const objectUri = `/sap/bc/adt/programs/includes/${encodeURIComponent(name.toLowerCase())}`;
        const log: string[] = [];
        log.push(`Include ${name} created (HTTP ${createResp.status}).`);

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
