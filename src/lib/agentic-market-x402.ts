import { NextRequest, NextResponse } from "next/server";

const BASE_MAINNET_CAIP2 = "eip155:8453";
const BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_BASE_PAY_TO = "0x28fA8cD01F66D5324827Cf851c0dc88D81CAEF0d";

const PAYMENT_REQUIRED_HEADER_NAMES = "PAYMENT-REQUIRED, X-PAYMENT-REQUIRED";
const PAYMENT_RESPONSE_HEADER_NAMES = "PAYMENT-RESPONSE, X-PAYMENT-RESPONSE";

type JsonSchema = Record<string, unknown>;

interface AgenticMarketOptions {
  amount: string;
  description: string;
  name: string;
  category: string;
  tags: string[];
  outputExample: Record<string, unknown>;
  outputExampleSchema: JsonSchema;
}

function encodeHeaderJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function getBasePayToAddress() {
  const candidate = process.env["X402_BASE_PAY_TO_ADDRESS"]?.trim() || DEFAULT_BASE_PAY_TO;
  return /^0x[a-fA-F0-9]{40}$/.test(candidate) ? candidate : DEFAULT_BASE_PAY_TO;
}

function buildBazaarSchema(outputExampleSchema: JsonSchema): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      category: { type: "string" },
      tags: {
        type: "array",
        items: { type: "string" },
      },
      input: {
        type: "object",
        properties: {
          type: { type: "string", const: "http" },
          method: { type: "string", const: "GET" },
        },
        required: ["type", "method"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          type: { type: "string", const: "json" },
          example: outputExampleSchema,
        },
        required: ["type", "example"],
        additionalProperties: false,
      },
    },
    required: ["name", "description", "category", "tags", "input", "output"],
    additionalProperties: false,
  };
}

export function agenticMarketPaymentRequired(request: NextRequest, options: AgenticMarketOptions) {
  const paymentRequired = {
    x402Version: 2,
    resource: {
      url: request.url,
      description: options.description,
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: BASE_MAINNET_CAIP2,
        payTo: getBasePayToAddress(),
        asset: BASE_USDC_CONTRACT,
        amount: options.amount,
        maxTimeoutSeconds: 300,
        extra: {
          name: "USDC",
          version: "2",
        },
      },
    ],
    extensions: {
      bazaar: {
        discoverable: true,
        category: options.category,
        tags: options.tags,
        info: {
          name: options.name,
          description: options.description,
          category: options.category,
          tags: options.tags,
          input: {
            type: "http",
            method: "GET",
          },
          output: {
            type: "json",
            example: options.outputExample,
          },
        },
        schema: buildBazaarSchema(options.outputExampleSchema),
      },
    },
  };

  const encoded = encodeHeaderJson(paymentRequired);

  return NextResponse.json(paymentRequired, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": encoded,
      "X-PAYMENT-REQUIRED": encoded,
      "Accept-Payment": `x402; network="${BASE_MAINNET_CAIP2}"; asset="${BASE_USDC_CONTRACT}"; amount="${options.amount}"`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": `${PAYMENT_REQUIRED_HEADER_NAMES}, ${PAYMENT_RESPONSE_HEADER_NAMES}`,
      "Cache-Control": "no-store",
    },
  });
}
