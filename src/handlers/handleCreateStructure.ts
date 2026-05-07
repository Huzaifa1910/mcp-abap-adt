import { McpError, ErrorCode } from '../lib/utils';
import {
    makeAdtRequest,
    return_error,
    getBaseUrl,
    activateObject,
    writeObjectSource
} from '../lib/utils';

/**
 * Create a DDIC structure via ADT.
 *
 * args:
 *   structure_name - required, e.g. "ZS_CUST"
 *   description    - required, short description
 *   source_code    - optional, full CDS-style structure source.
 *                    Default: minimal structure with one CHAR(10) field.
 *   package        - optional, default "$TMP".
 *   transport      - optional, required for non-$TMP.
 *   activate       - optional, default true.
 */
export async function handleCreateStructure(args: any) {
    try {
        if (!args?.structure_name) {
            throw new McpError(ErrorCode.InvalidParams, 'structure_name is required');
        }
        if (!args?.description) {
            throw new McpError(ErrorCode.InvalidParams, 'description is required');
        }

        const name = String(args.structure_name).toUpperCase();
        const description = String(args.description);
        const pkg = String(args.package || '$TMP').toUpperCase();
        const transport = args.transport ? String(args.transport) : '';
        const sourceCode = typeof args.source_code === 'string' && args.source_code.length > 0
            ? args.source_code
            : `@EndUserText.label : '${escapeApostrophes(description)}'
@AbapCatalog.enhancement.category : #EXTENSIBLE_CHARACTER_NUMERIC
define structure ${name.toLowerCase()} {
  field1 : abap.char(10);
}`;
        const doActivate = args.activate !== false;

        // Existing structures expose <blue:blueSource>; mirror that on create.
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue"
                 xmlns:adtcore="http://www.sap.com/adt/core"
                 adtcore:type="TABL/DS"
                 adtcore:name="${name}"
                 adtcore:description="${escapeXml(description)}"
                 adtcore:abapLanguageVersion="standard"
                 adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</blue:blueSource>`;

        const baseUrl = await getBaseUrl();
        const createUrl = `${baseUrl}/sap/bc/adt/ddic/structures`
            + (transport ? `?corrNr=${encodeURIComponent(transport)}` : '');

        const createResp = await makeAdtRequest(createUrl, 'POST', 60000, xml, undefined, {
            'Content-Type': 'application/vnd.sap.adt.structures.v2+xml',
            'Accept': 'application/vnd.sap.adt.structures.v2+xml'
        });

        const objectUri = `/sap/bc/adt/ddic/structures/${encodeURIComponent(name.toLowerCase())}`;
        const log: string[] = [];
        log.push(`Structure ${name} created (HTTP ${createResp.status}).`);

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

function escapeApostrophes(s: string): string {
    return s.replace(/'/g, "''");
}
