#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import dotenv from 'dotenv';

// Import handler functions
import { handleGetProgram } from './handlers/handleGetProgram';
import { handleGetClass } from './handlers/handleGetClass';
import { handleGetFunctionGroup } from './handlers/handleGetFunctionGroup';
import { handleGetFunction } from './handlers/handleGetFunction';
import { handleGetTable } from './handlers/handleGetTable';
import { handleGetStructure } from './handlers/handleGetStructure';
import { handleGetTableContents } from './handlers/handleGetTableContents';
import { handleGetPackage } from './handlers/handleGetPackage';
import { handleGetInclude } from './handlers/handleGetInclude';
import { handleGetTypeInfo } from './handlers/handleGetTypeInfo';
import { handleGetInterface } from './handlers/handleGetInterface';
import { handleGetTransaction } from './handlers/handleGetTransaction';
import { handleSearchObject } from './handlers/handleSearchObject';
import { handleCreateProgram } from './handlers/handleCreateProgram';
import { handleCreatePackage } from './handlers/handleCreatePackage';
import { handleCreateStructure } from './handlers/handleCreateStructure';
import { handleCreateTable } from './handlers/handleCreateTable';
import { handleCreateClass } from './handlers/handleCreateClass';
import { handleCreateInterface } from './handlers/handleCreateInterface';
import { handleUpdateObjectSource } from './handlers/handleUpdateObjectSource';
import { handleActivateObject } from './handlers/handleActivateObject';
import { handleUnlockObject } from './handlers/handleUnlockObject';
import { handleDeleteObject } from './handlers/handleDeleteObject';
import { handleCreateInclude } from './handlers/handleCreateInclude';
import { handleCreateTransport } from './handlers/handleCreateTransport';

// Import shared utility functions and types
import { getBaseUrl, getAuthHeaders, createAxiosInstance, makeAdtRequest, return_error, return_response } from './lib/utils';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Interface for SAP configuration
export interface SapConfig {
  url: string;
  username: string;
  password: string;
  client: string;
}

/**
 * Retrieves SAP configuration from environment variables.
 *
 * @returns {SapConfig} The SAP configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
export function getConfig(): SapConfig {
  const url = process.env.SAP_URL;
  const username = process.env.SAP_USERNAME;
  const password = process.env.SAP_PASSWORD;
  const client = process.env.SAP_CLIENT;

  // Check if all required environment variables are set
  if (!url || !username || !password || !client) {
    throw new Error(`Missing required environment variables. Required variables:
- SAP_URL
- SAP_USERNAME
- SAP_PASSWORD
- SAP_CLIENT`);
  }

  return { url, username, password, client };
}

/**
 * Server class for interacting with ABAP systems via ADT.
 */
export class mcp_abap_adt_server {
  private server: Server;  // Instance of the MCP server
  private sapConfig: SapConfig; // SAP configuration

  /**
   * Constructor for the mcp_abap_adt_server class.
   */
  constructor() {
    this.sapConfig = getConfig(); // Load SAP configuration
    this.server = new Server(  // Initialize the MCP server
      {
        name: 'mcp-abap-adt', // Server name
        version: '0.1.0',       // Server version
      },
      {
        capabilities: {
          tools: {}, // Initially, no tools are registered
        },
      }
    );

    this.setupHandlers(); // Setup request handlers
  }

  /**
   * Sets up request handlers for listing and calling tools.
   * @private
   */
  private setupHandlers() {
    // Setup tool handlers

    // Handler for ListToolsRequest
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [ // Define available tools
          {
            name: 'GetProgram',
            description: 'Retrieve ABAP program source code',
            inputSchema: {
              type: 'object',
              properties: {
                program_name: {
                  type: 'string',
                  description: 'Name of the ABAP program'
                }
              },
              required: ['program_name']
            }
          },
          {
            name: 'GetClass',
            description: 'Retrieve ABAP class source code',
            inputSchema: {
              type: 'object',
              properties: {
                class_name: {
                  type: 'string',
                  description: 'Name of the ABAP class'
                }
              },
              required: ['class_name']
            }
          },
          {
            name: 'GetFunctionGroup',
            description: 'Retrieve ABAP Function Group source code',
            inputSchema: {
              type: 'object',
              properties: {
                function_group: {
                  type: 'string',
                  description: 'Name of the function module'
                }
              },
              required: ['function_group']
            }
          },
          {
            name: 'GetFunction',
            description: 'Retrieve ABAP Function Module source code',
            inputSchema: {
              type: 'object',
              properties: {
                function_name: {
                  type: 'string',
                  description: 'Name of the function module'
                },
                function_group: {
                  type: 'string',
                  description: 'Name of the function group'
                }
              },
              required: ['function_name', 'function_group']
            }
          },
          {
            name: 'GetStructure',
            description: 'Retrieve ABAP Structure',
            inputSchema: {
              type: 'object',
              properties: {
                structure_name: {
                  type: 'string',
                  description: 'Name of the ABAP Structure'
                }
              },
              required: ['structure_name']
            }
          },
          {
            name: 'GetTable',
            description: 'Retrieve ABAP table structure',
            inputSchema: {
              type: 'object',
              properties: {
                table_name: {
                  type: 'string',
                  description: 'Name of the ABAP table'
                }
              },
              required: ['table_name']
            }
          },
          {
            name: 'GetTableContents',
            description: 'Retrieve contents of an ABAP table',
            inputSchema: {
              type: 'object',
              properties: {
                table_name: {
                  type: 'string',
                  description: 'Name of the ABAP table'
                },
                max_rows: {
                  type: 'number',
                  description: 'Maximum number of rows to retrieve',
                  default: 100
                }
              },
              required: ['table_name']
            }
          },
          {
            name: 'GetPackage',
            description: 'Retrieve ABAP package details',
            inputSchema: {
              type: 'object',
              properties: {
                package_name: {
                  type: 'string',
                  description: 'Name of the ABAP package'
                }
              },
              required: ['package_name']
            }
          },
          {
            name: 'GetTypeInfo',
            description: 'Retrieve ABAP type information',
            inputSchema: {
              type: 'object',
              properties: {
                type_name: {
                  type: 'string',
                  description: 'Name of the ABAP type'
                }
              },
              required: ['type_name']
            }
          },
          {
            name: 'GetInclude',
            description: 'Retrieve ABAP Include Source Code',
            inputSchema: {
              type: 'object',
              properties: {
                include_name: {
                  type: 'string',
                  description: 'Name of the ABAP Include'
                }
              },
              required: ['include_name']
            }
          },
          {
            name: 'SearchObject',
            description: 'Search for ABAP objects using quick search',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query string (use * wildcard for partial match)'
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 100
                }
              },
              required: ['query']
            }
          },
          {
            name: 'GetTransaction',
            description: 'Retrieve ABAP transaction details',
            inputSchema: {
              type: 'object',
              properties: {
                transaction_name: {
                  type: 'string',
                  description: 'Name of the ABAP transaction'
                }
              },
              required: ['transaction_name']
            }
          },
          {
            name: 'GetInterface',
            description: 'Retrieve ABAP interface source code',
            inputSchema: {
              type: 'object',
              properties: {
                interface_name: {
                  type: 'string',
                  description: 'Name of the ABAP interface'
                }
              },
              required: ['interface_name']
            }
          },
          {
            name: 'CreatePackage',
            description: 'Create an ABAP package via ADT (write operation)',
            inputSchema: {
              type: 'object',
              properties: {
                package_name: { type: 'string', description: 'Name of the new package, e.g. ZTEST_PKG' },
                description: { type: 'string', description: 'Short description' },
                super_package: { type: 'string', description: 'Parent package, default $TMP' },
                software_component: { type: 'string', description: 'Software component, default HOME' },
                transport: { type: 'string', description: 'Transport request (required if super_package is not $TMP)' },
                activate: { type: 'boolean', description: 'Activate after create, default true' }
              },
              required: ['package_name', 'description']
            }
          },
          {
            name: 'CreateProgram',
            description: 'Create an ABAP report (executable program) via ADT, push source, and activate',
            inputSchema: {
              type: 'object',
              properties: {
                program_name: { type: 'string', description: 'Name of the program, e.g. ZHELLO' },
                description: { type: 'string', description: 'Short description' },
                source_code: { type: 'string', description: 'Full ABAP source. Default: minimal REPORT skeleton' },
                package: { type: 'string', description: 'Package, default $TMP' },
                transport: { type: 'string', description: 'Transport request (required for non-$TMP packages)' },
                activate: { type: 'boolean', description: 'Activate after upload, default true' }
              },
              required: ['program_name', 'description']
            }
          },
          {
            name: 'CreateStructure',
            description: 'Create a DDIC structure via ADT, push CDS-style source, and activate',
            inputSchema: {
              type: 'object',
              properties: {
                structure_name: { type: 'string', description: 'Name of the structure, e.g. ZS_CUST' },
                description: { type: 'string', description: 'Short description' },
                source_code: { type: 'string', description: 'CDS-style structure definition. Default: one CHAR(10) field' },
                package: { type: 'string', description: 'Package, default $TMP' },
                transport: { type: 'string', description: 'Transport request (required for non-$TMP packages)' },
                activate: { type: 'boolean', description: 'Activate after upload, default true' }
              },
              required: ['structure_name', 'description']
            }
          },
          {
            name: 'CreateTable',
            description: 'Create a DDIC transparent table via ADT, push CDS-style table source, and activate',
            inputSchema: {
              type: 'object',
              properties: {
                table_name: { type: 'string', description: 'Name of the table, e.g. ZHCM_EMPLOYEE' },
                description: { type: 'string', description: 'Short description' },
                source_code: { type: 'string', description: 'CDS-style table definition. Default: client + key id + name field' },
                package: { type: 'string', description: 'Package, default $TMP' },
                transport: { type: 'string', description: 'Transport request (required for non-$TMP packages)' },
                activate: { type: 'boolean', description: 'Activate after upload, default true' }
              },
              required: ['table_name', 'description']
            }
          },
          {
            name: 'CreateClass',
            description: 'Create an ABAP global class via ADT, push source, and activate',
            inputSchema: {
              type: 'object',
              properties: {
                class_name: { type: 'string', description: 'Name of the class, e.g. ZCL_HCM_EMPLOYEE' },
                description: { type: 'string', description: 'Short description' },
                source_code: { type: 'string', description: 'Full class source. Default: empty PUBLIC FINAL skeleton' },
                package: { type: 'string', description: 'Package, default $TMP' },
                transport: { type: 'string', description: 'Transport request (required for non-$TMP packages)' },
                activate: { type: 'boolean', description: 'Activate after upload, default true' }
              },
              required: ['class_name', 'description']
            }
          },
          {
            name: 'CreateInterface',
            description: 'Create an ABAP interface via ADT, push source, and activate',
            inputSchema: {
              type: 'object',
              properties: {
                interface_name: { type: 'string', description: 'Name of the interface, e.g. ZIF_HCM_EMPLOYEE' },
                description: { type: 'string', description: 'Short description' },
                source_code: { type: 'string', description: 'Full interface source. Default: empty INTERFACE skeleton' },
                package: { type: 'string', description: 'Package, default $TMP' },
                transport: { type: 'string', description: 'Transport request (required for non-$TMP packages)' },
                activate: { type: 'boolean', description: 'Activate after upload, default true' }
              },
              required: ['interface_name', 'description']
            }
          },
          {
            name: 'UpdateObjectSource',
            description: 'Push new source code to an existing ADT object (lock + PUT + unlock + optional activate). Useful for replication: read source from one system, write to another.',
            inputSchema: {
              type: 'object',
              properties: {
                object_uri: { type: 'string', description: 'ADT object URI, e.g. /sap/bc/adt/programs/programs/zhello' },
                object_name: { type: 'string', description: 'Uppercase object name, e.g. ZHELLO' },
                source_code: { type: 'string', description: 'Full source text to write' },
                activate: { type: 'boolean', description: 'Activate after upload, default true' }
              },
              required: ['object_uri', 'object_name', 'source_code']
            }
          },
          {
            name: 'ActivateObject',
            description: 'Activate an existing ADT object. Activation messages (errors/warnings) are returned in the body.',
            inputSchema: {
              type: 'object',
              properties: {
                object_uri: { type: 'string', description: 'ADT object URI, e.g. /sap/bc/adt/oo/classes/zcl_demo' },
                object_name: { type: 'string', description: 'Uppercase object name, e.g. ZCL_DEMO' }
              },
              required: ['object_uri', 'object_name']
            }
          },
          {
            name: 'UnlockObject',
            description: 'Best-effort lock release for a stuck ADT object. SAP enqueue locks are session-bound; foreign-session locks survive this call and need SM12 admin or ~30 min ENQUEUE timeout.',
            inputSchema: {
              type: 'object',
              properties: {
                object_uri: { type: 'string', description: 'ADT object URI, e.g. /sap/bc/adt/oo/classes/zcl_demo' },
                lock_handle: { type: 'string', description: 'Optional lock handle if you have one. If absent, attempts a session-scoped UNLOCK.' }
              },
              required: ['object_uri']
            }
          },
          {
            name: 'DeleteObject',
            description: 'Delete an ADT object (DELETE /sap/bc/adt/<uri>). Acquires a lock first unless skip_lock is true.',
            inputSchema: {
              type: 'object',
              properties: {
                object_uri: { type: 'string', description: 'ADT object URI, e.g. /sap/bc/adt/oo/classes/zcl_demo' },
                transport: { type: 'string', description: 'Transport request (required for non-$TMP objects)' },
                skip_lock: { type: 'boolean', description: 'Skip the LOCK pre-step (e.g. for packages). Default false.' }
              },
              required: ['object_uri']
            }
          },
          {
            name: 'CreateInclude',
            description: 'Create a standalone ABAP program include (PROG/I) via ADT, push source, and activate.',
            inputSchema: {
              type: 'object',
              properties: {
                include_name: { type: 'string', description: 'Name of the include, e.g. ZINC_HELLO' },
                description: { type: 'string', description: 'Short description' },
                source_code: { type: 'string', description: 'Full ABAP source. Default: minimal include header' },
                package: { type: 'string', description: 'Package, default $TMP' },
                transport: { type: 'string', description: 'Transport request (required for non-$TMP packages)' },
                activate: { type: 'boolean', description: 'Activate after upload, default true' }
              },
              required: ['include_name', 'description']
            }
          },
          {
            name: 'CreateTransport',
            description: 'Create a new CTS transport request (TR) on this SAP system via ADT. Returns the new TR number and the auto-created task. Useful when migrating objects: create a TR on target, then pass its number as `transport` to CreatePackage / CreateProgram / etc.',
            inputSchema: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Short description for the TR' },
                type: { type: 'string', description: '"K" = Workbench (default), "W" = Customizing' },
                target: { type: 'string', description: 'Transport target system (e.g. "QAS"). Empty = SAP picks layer default. Use "LOCAL" for a non-transportable local request.' },
                owner: { type: 'string', description: 'Owner user. Defaults to the logged-in user.' }
              },
              required: ['description']
            }
          }
        ]
      };
    });

    // Handler for CallToolRequest
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'GetProgram':
          return await handleGetProgram(request.params.arguments);
        case 'GetClass':
          return await handleGetClass(request.params.arguments);
        case 'GetFunction':
          return await handleGetFunction(request.params.arguments);
        case 'GetFunctionGroup':
          return await handleGetFunctionGroup(request.params.arguments);
        case 'GetStructure':
          return await handleGetStructure(request.params.arguments);
        case 'GetTable':
          return await handleGetTable(request.params.arguments);
        case 'GetTableContents':
          return await handleGetTableContents(request.params.arguments);
        case 'GetPackage':
          return await handleGetPackage(request.params.arguments);
        case 'GetTypeInfo':
          return await handleGetTypeInfo(request.params.arguments);
        case 'GetInclude':
          return await handleGetInclude(request.params.arguments);
        case 'SearchObject':
          return await handleSearchObject(request.params.arguments);
        case 'GetInterface':
          return await handleGetInterface(request.params.arguments);
        case 'GetTransaction':
          return await handleGetTransaction(request.params.arguments);
        case 'CreatePackage':
          return await handleCreatePackage(request.params.arguments);
        case 'CreateProgram':
          return await handleCreateProgram(request.params.arguments);
        case 'CreateStructure':
          return await handleCreateStructure(request.params.arguments);
        case 'CreateTable':
          return await handleCreateTable(request.params.arguments);
        case 'CreateClass':
          return await handleCreateClass(request.params.arguments);
        case 'CreateInterface':
          return await handleCreateInterface(request.params.arguments);
        case 'UpdateObjectSource':
          return await handleUpdateObjectSource(request.params.arguments);
        case 'ActivateObject':
          return await handleActivateObject(request.params.arguments);
        case 'UnlockObject':
          return await handleUnlockObject(request.params.arguments);
        case 'DeleteObject':
          return await handleDeleteObject(request.params.arguments);
        case 'CreateInclude':
          return await handleCreateInclude(request.params.arguments);
        case 'CreateTransport':
          return await handleCreateTransport(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });

    // Handle server shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Starts the MCP server and connects it to the transport.
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Create and run the server
const server = new mcp_abap_adt_server();
server.run().catch((error) => {
  process.exit(1);
});
