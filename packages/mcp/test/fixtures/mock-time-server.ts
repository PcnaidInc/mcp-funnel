#!/usr/bin/env tsx

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'mock-time-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_current_time',
      description: 'Return a deterministic time fixture response',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'get_current_time') {
    throw new Error('Unknown tool');
  }

  return {
    content: [
      {
        type: 'text',
        text: '2000-01-01T00:00:00.000Z',
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
