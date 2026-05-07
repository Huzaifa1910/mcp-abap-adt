#!/usr/bin/env node
/*
 * Demo runner: exercises all 21 mcp-abap-adt tools by building a small
 * ZMCP_HCM employee-master app on the target SAP system.
 *
 * Usage examples:
 *   node tests/demo_runner.mjs --server sap-target
 *   node tests/demo_runner.mjs --server sap-source
 *   node tests/demo_runner.mjs --config "C:/path/to/mcp.json" --server sap-target
 *   SAP_URL=... SAP_USERNAME=... SAP_PASSWORD=... SAP_CLIENT=... node tests/demo_runner.mjs --env
 *
 * The script spawns dist/index.js, performs the MCP handshake, then calls
 * each tool in dependency order. Pass/fail + duration are printed per step.
 */
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_BIN = path.resolve(__dirname, '..', 'dist', 'index.js');

// -------- argv parsing --------
const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (!k.startsWith('--')) continue;
  const key = k.slice(2);
  const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  opts[key] = v;
}

let env;
if (opts.env) {
  env = {
    SAP_URL: process.env.SAP_URL,
    SAP_USERNAME: process.env.SAP_USERNAME,
    SAP_PASSWORD: process.env.SAP_PASSWORD,
    SAP_CLIENT: process.env.SAP_CLIENT,
    TLS_REJECT_UNAUTHORIZED: process.env.TLS_REJECT_UNAUTHORIZED || '0'
  };
} else {
  const cfgPath = opts.config || path.join(process.env.APPDATA || '', 'Code', 'User', 'mcp.json');
  if (!existsSync(cfgPath)) {
    console.error(`mcp.json not found at: ${cfgPath}`);
    process.exit(2);
  }
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const name = opts.server || 'sap-target';
  const srv = cfg.servers?.[name];
  if (!srv) {
    console.error(`Server "${name}" not in ${cfgPath}. Available: ${Object.keys(cfg.servers || {}).join(', ')}`);
    process.exit(2);
  }
  env = { ...srv.env, TLS_REJECT_UNAUTHORIZED: '0' };
  console.log(`Using config: ${cfgPath}, server: ${name} (${env.SAP_USERNAME}@${env.SAP_CLIENT})`);
}

if (!env.SAP_URL || !env.SAP_USERNAME || !env.SAP_PASSWORD || !env.SAP_CLIENT) {
  console.error('Missing SAP credentials. Pass via --server <name> from mcp.json or --env with env vars.');
  process.exit(2);
}

// -------- spawn server --------
const proc = spawn(process.execPath, [SERVER_BIN], {
  env: { ...process.env, ...env },
  stdio: ['pipe', 'pipe', 'inherit']
});

let nextId = 1;
const pending = new Map();
readline.createInterface({ input: proc.stdout }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function send(method, params = {}, timeoutMs = 90000) {
  const id = nextId++;
  const req = { jsonrpc: '2.0', id, method, params };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout after ${timeoutMs}ms: ${method}`));
    }, timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    });
    proc.stdin.write(JSON.stringify(req) + '\n');
  });
}
function notify(method, params = {}) {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
const callTool = (name, args = {}) => send('tools/call', { name, arguments: args });

// -------- demo plan --------
const PKG = '$MCP_HCM';
const STR = 'ZSMCP_EMP_TYPE';
const TAB = 'ZTMCP_EMPLOYEE';
const IF_ = 'ZIF_MCP_EMP_OPS';
const CL_ = 'ZCL_MCP_EMPLOYEE';
const PRG = 'ZMCP_EMPLOYEE_DEMO';
const INC = 'ZINC_MCP_HELLO';
const TOTAL = 24;

const STR_SRC =
`@EndUserText.label : 'MCP demo: employee type'
@AbapCatalog.enhancement.category : #EXTENSIBLE_CHARACTER_NUMERIC
define structure zsmcp_emp_type {
  emp_id   : abap.char(10);
  emp_name : abap.char(40);
  dept     : abap.char(20);
}`;

const TAB_SRC =
`@EndUserText.label : 'MCP demo: employees'
@AbapCatalog.enhancementCategory : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #ALLOWED
define table ztmcp_employee {
  key client   : abap.clnt not null;
  key emp_id   : abap.char(10) not null;
  emp_name     : abap.char(40);
  dept         : abap.char(20);
  joined_on    : abap.dats;
}`;

const IF_SRC =
`INTERFACE zif_mcp_emp_ops
  PUBLIC.

  METHODS get_count
    RETURNING VALUE(rv_count) TYPE i.

  METHODS greet
    IMPORTING iv_id          TYPE c
    RETURNING VALUE(rv_text) TYPE string.

ENDINTERFACE.`;

const CL_SKELETON =
`CLASS zcl_mcp_employee DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_mcp_employee IMPLEMENTATION.
ENDCLASS.`;

const CL_RICH =
`CLASS zcl_mcp_employee DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_mcp_emp_ops.
ENDCLASS.

CLASS zcl_mcp_employee IMPLEMENTATION.

  METHOD zif_mcp_emp_ops~get_count.
    SELECT COUNT(*) FROM ztmcp_employee INTO rv_count.
  ENDMETHOD.

  METHOD zif_mcp_emp_ops~greet.
    DATA(lv_id) = CONV ztmcp_employee-emp_id( iv_id ).
    SELECT SINGLE emp_name FROM ztmcp_employee
      WHERE emp_id = @lv_id
      INTO @DATA(lv_name).
    rv_text = COND #( WHEN sy-subrc = 0
                      THEN |Hello { lv_name }!|
                      ELSE |Employee { lv_id } not found| ).
  ENDMETHOD.

ENDCLASS.`;

const PRG_SRC =
`REPORT zmcp_employee_demo.

DATA: lo_emp TYPE REF TO zif_mcp_emp_ops.

START-OF-SELECTION.
  lo_emp = NEW zcl_mcp_employee( ).
  WRITE: / 'Employee count:', lo_emp->get_count( ).
  WRITE: / lo_emp->greet( '0000000001' ).`;

// -------- runner --------
const results = [];
async function step(label, fn, opts = {}) {
  const idx = results.length + 1;
  process.stdout.write(`[${String(idx).padStart(2)}/${TOTAL}] ${label.padEnd(50)} `);
  const t0 = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t0;
    const text = (r?.content?.[0]?.text || '').toString();
    const isError = !!r?.isError;
    // Treat ExceptionResourceAlreadyExists as success — a previous run
    // already created the object, the tool itself worked.
    const alreadyExists = /ExceptionResourceAlreadyExists|does already exist|already exists with the name/.test(text);
    const looksOk = (!isError && (opts.allowEmpty || text.length > 0)) || alreadyExists;
    const probablyError = (isError || (text.length > 0 && /^Error:/i.test(text))) && !alreadyExists;
    const ok = looksOk && !probablyError;
    results.push({ idx, label, ok, ms, text });
    console.log(ok
      ? `OK    (${ms}ms, ${text.length}b)`
      : `FAIL  (${ms}ms) :: ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
    return r;
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ idx, label, ok: false, ms, text: String(e) });
    console.log(`ERROR (${ms}ms) :: ${String(e).slice(0, 200)}`);
    return null;
  }
}

async function main() {
  // Handshake
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-abap-adt-demo-runner', version: '1.0.0' }
  });
  notify('notifications/initialized');
  console.log('MCP handshake complete. Tool list count:',
    (await send('tools/list', {})).tools.length);
  console.log('');

  // Build the demo: package -> structure -> table -> interface -> class -> program
  const activePkg = PKG;
  await step(`CreatePackage ${PKG}`,
    () => callTool('CreatePackage', {
      package_name: PKG, description: 'MCP demo HCM package', super_package: '$TMP'
    }));
  await step(`GetPackage ${PKG}`,
    () => callTool('GetPackage', { package_name: PKG }), { allowEmpty: true });

  await step(`CreateStructure ${STR}`,
    () => callTool('CreateStructure', {
      structure_name: STR, description: 'MCP demo employee type',
      package: activePkg, source_code: STR_SRC
    }));
  await step(`GetStructure ${STR}`,
    () => callTool('GetStructure', { structure_name: STR }));

  await step(`CreateTable ${TAB}`,
    () => callTool('CreateTable', {
      table_name: TAB, description: 'MCP demo employees table',
      package: activePkg, source_code: TAB_SRC
    }));
  await step(`GetTable ${TAB}`,
    () => callTool('GetTable', { table_name: TAB }));
  await step(`GetTableContents ${TAB}`,
    () => callTool('GetTableContents', { table_name: TAB, max_rows: 5 }), { allowEmpty: true });

  await step(`CreateInterface ${IF_}`,
    () => callTool('CreateInterface', {
      interface_name: IF_, description: 'MCP demo emp ops',
      package: activePkg, source_code: IF_SRC
    }));
  await step(`GetInterface ${IF_}`,
    () => callTool('GetInterface', { interface_name: IF_ }));

  await step(`CreateClass ${CL_} (skeleton)`,
    () => callTool('CreateClass', {
      class_name: CL_, description: 'MCP demo employee class',
      package: activePkg, source_code: CL_SKELETON
    }));
  await step(`GetClass ${CL_}`,
    () => callTool('GetClass', { class_name: CL_ }));

  // Pre-emptively release any stuck lock on the class. This is a no-op for
  // healthy state but releases orphaned locks left over from prior runs that
  // crashed before unlock. Then a small wait for SAP enqueue settling.
  await step(`UnlockObject ${CL_}`,
    () => callTool('UnlockObject', {
      object_uri: `/sap/bc/adt/oo/classes/${CL_.toLowerCase()}`
    }), { allowEmpty: true });
  await new Promise(r => setTimeout(r, 5000));
  await step(`UpdateObjectSource ${CL_} (rich)`,
    () => callTool('UpdateObjectSource', {
      object_uri: `/sap/bc/adt/oo/classes/${CL_.toLowerCase()}`,
      object_name: CL_,
      source_code: CL_RICH,
      activate: false
    }));
  await step(`ActivateObject ${CL_}`,
    () => callTool('ActivateObject', {
      object_uri: `/sap/bc/adt/oo/classes/${CL_.toLowerCase()}`,
      object_name: CL_
    }));

  await step(`CreateProgram ${PRG}`,
    () => callTool('CreateProgram', {
      program_name: PRG, description: 'MCP demo program',
      package: activePkg, source_code: PRG_SRC
    }));
  await step(`GetProgram ${PRG}`,
    () => callTool('GetProgram', { program_name: PRG }));

  // Cross-checks against well-known SAP-standard objects
  await step('GetFunction BAPI_CONTRACT_CREATE / 2014',
    () => callTool('GetFunction', {
      function_name: 'BAPI_CONTRACT_CREATE', function_group: '2014'
    }));
  await step('GetFunctionGroup 2014',
    () => callTool('GetFunctionGroup', { function_group: '2014' }));
  await step('GetTypeInfo BUKRS',
    () => callTool('GetTypeInfo', { type_name: 'BUKRS' }));
  await step('GetTransaction SE38',
    () => callTool('GetTransaction', { transaction_name: 'SE38' }));
  await step('GetInclude MV45AF0X',
    () => callTool('GetInclude', { include_name: 'MV45AF0X' }));
  await step('SearchObject ZMCP*',
    () => callTool('SearchObject', { query: 'ZMCP*', maxResults: 20 }));

  // New tools: round-trip a Z include via CreateInclude → GetInclude → DeleteObject
  await step(`CreateInclude ${INC}`,
    () => callTool('CreateInclude', {
      include_name: INC,
      description: 'MCP demo include',
      package: PKG,
      source_code: `*&-- ${INC}\nWRITE: / 'Hello from MCP-created include'.`
    }));
  await step(`GetInclude ${INC}`,
    () => callTool('GetInclude', { include_name: INC }));
  // Wait for the activation lock from CreateInclude to clear before DELETE
  await new Promise(r => setTimeout(r, 5000));
  await step(`DeleteObject ${INC}`,
    () => callTool('DeleteObject', {
      object_uri: `/sap/bc/adt/programs/includes/${INC.toLowerCase()}`
    }));

  // -------- summary --------
  console.log('');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`Summary: ${passed}/${results.length} passed.`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) {
      console.log(`  [${f.idx}] ${f.label}: ${f.text.slice(0, 300).replace(/\s+/g, ' ')}`);
    }
  }
  proc.kill();
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('Runner crashed:', err);
  proc.kill();
  process.exit(2);
});
