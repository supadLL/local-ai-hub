import crypto from "node:crypto";
import { resolveCodexModel } from "../model-catalog.js";
import type { CodexCollectedResponse, CodexFunctionCall, CodexUsageInfo } from "./codex-backend.js";
import { iterateCodexEvents } from "./codex-backend.js";

type CodexContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

type CodexInputItem =
  | { role: "user"; content: string | CodexContentPart[] }
  | { role: "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

type CodexTool =
  | { type: "function"; name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean }
  | { type: "web_search" };

export interface CodexRequestBody {
  model: string;
  instructions: string;
  input: string | CodexInputItem[];
  stream: true;
  store: false;
  reasoning?: {
    effort?: string;
    summary?: "auto";
  };
  tools?: CodexTool[];
  tool_choice?: string | { type: "function"; name: string } | { type: "web_search" };
  parallel_tool_calls?: boolean;
  text?: Record<string, unknown>;
  include?: unknown[];
  service_tier?: string;
  prompt_cache_key?: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens?: number;
  messages?: Array<{
    role: "user" | "assistant";
    content: string | Array<Record<string, unknown>>;
  }>;
  system?: string | Array<{ text: string }>;
  stream?: boolean;
  thinking?: {
    type: "enabled" | "disabled" | "adaptive";
    budget_tokens?: number;
  };
  tools?: Array<Record<string, unknown>>;
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === "object" && !("properties" in schema)) {
    return {
      ...schema,
      properties: {}
    };
  }
  return schema;
}

function textFromOpenAIContent(content: unknown): string | CodexContentPart[] {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return asString(content);
  }

  const parts: CodexContentPart[] = [];
  for (const part of content) {
    if (!isRecord(part)) {
      continue;
    }
    if (part.type === "text" && typeof part.text === "string") {
      parts.push({ type: "input_text", text: part.text });
    }
    if (part.type === "image_url" && isRecord(part.image_url) && typeof part.image_url.url === "string") {
      parts.push({ type: "input_image", image_url: part.image_url.url });
    }
  }

  return parts.length > 0 ? parts : "";
}

function textFromAnthropicContent(content: string | Array<Record<string, unknown>>): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

function multimodalFromAnthropicContent(content: Array<Record<string, unknown>>): string | CodexContentPart[] {
  const parts: CodexContentPart[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push({ type: "input_text", text: block.text });
    }
    if (block.type === "image" && isRecord(block.source)) {
      const source = block.source;
      if (source.type === "base64" && typeof source.media_type === "string" && typeof source.data === "string") {
        parts.push({
          type: "input_image",
          image_url: `data:${source.media_type};base64,${source.data}`
        });
      }
    }
  }
  return parts.length > 0 ? parts : textFromAnthropicContent(content);
}

function anthropicContentToInputItems(
  role: "user" | "assistant",
  content: string | Array<Record<string, unknown>>
): CodexInputItem[] {
  if (typeof content === "string") {
    return [{ role, content }];
  }

  const items: CodexInputItem[] = [];
  const hasToolBlocks = content.some((block) => block.type === "tool_use" || block.type === "tool_result");

  if (role === "user") {
    const extracted = multimodalFromAnthropicContent(content);
    if ((typeof extracted === "string" && extracted) || Array.isArray(extracted) || !hasToolBlocks) {
      items.push({ role: "user", content: extracted || "" });
    }
  } else {
    const text = textFromAnthropicContent(content);
    if (text || !hasToolBlocks) {
      items.push({ role: "assistant", content: text });
    }
  }

  for (const block of content) {
    if (block.type === "tool_use") {
      const name = typeof block.name === "string" ? block.name : "tool";
      const callId = typeof block.id === "string" ? block.id : `call_${name}`;
      items.push({
        type: "function_call",
        call_id: callId,
        name,
        arguments: JSON.stringify(block.input ?? {})
      });
    }
    if (block.type === "tool_result") {
      const callId = typeof block.tool_use_id === "string" ? block.tool_use_id : "call";
      let output = "";
      if (typeof block.content === "string") {
        output = block.content;
      } else if (Array.isArray(block.content)) {
        output = block.content
          .filter((item) => isRecord(item) && item.type === "text" && typeof item.text === "string")
          .map((item) => (item as { text: string }).text)
          .join("\n");
      }
      items.push({
        type: "function_call_output",
        call_id: callId,
        output: block.is_error ? `Error: ${output}` : output
      });
    }
  }

  return items;
}

function instructionsFromMessages(messages: Array<Record<string, unknown>>): string {
  const systemTexts = messages
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => textFromOpenAIContent(message.content))
    .map((content) => (typeof content === "string" ? content : content.map((part) => part.type === "input_text" ? part.text : "").join("\n")))
    .filter(Boolean);
  return systemTexts.join("\n\n") || "You are a helpful assistant.";
}

function inputFromChatMessages(messages: Array<Record<string, unknown>>): CodexInputItem[] {
  const input: CodexInputItem[] = [];

  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      continue;
    }
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: typeof message.tool_call_id === "string" ? message.tool_call_id : "call",
        output: asString(message.content)
      });
      continue;
    }
    if (message.role === "assistant") {
      input.push({
        role: "assistant",
        content: typeof message.content === "string" ? message.content : ""
      });
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      for (const toolCall of toolCalls) {
        if (!isRecord(toolCall) || !isRecord(toolCall.function)) {
          continue;
        }
        input.push({
          type: "function_call",
          call_id: typeof toolCall.id === "string" ? toolCall.id : "call",
          name: typeof toolCall.function.name === "string" ? toolCall.function.name : "tool",
          arguments: typeof toolCall.function.arguments === "string" ? toolCall.function.arguments : "{}"
        });
      }
      continue;
    }

    input.push({
      role: "user",
      content: textFromOpenAIContent(message.content)
    });
  }

  return input.length > 0 ? input : [{ role: "user", content: "" }];
}

function openAIToolsToCodex(tools: unknown): CodexTool[] {
  if (!Array.isArray(tools)) {
    return [];
  }

  const converted: CodexTool[] = [];
  for (const tool of tools) {
    if (!isRecord(tool)) {
      continue;
    }
    if (tool.type === "web_search" || tool.type === "web_search_preview") {
      converted.push({ type: "web_search" });
      continue;
    }
    if (tool.type !== "function" || !isRecord(tool.function)) {
      continue;
    }
    const name = typeof tool.function.name === "string" ? tool.function.name : "";
    if (!name) {
      continue;
    }
    const def: CodexTool = {
      type: "function",
      name,
      strict: tool.function.strict === true
    };
    if (typeof tool.function.description === "string") {
      def.description = tool.function.description;
    }
    if (isRecord(tool.function.parameters)) {
      def.parameters = normalizeSchema(tool.function.parameters);
    }
    converted.push(def);
  }
  return converted;
}

function anthropicToolsToCodex(tools: unknown): CodexTool[] {
  if (!Array.isArray(tools)) {
    return [];
  }

  const converted: CodexTool[] = [];
  for (const tool of tools) {
    if (!isRecord(tool)) {
      continue;
    }
    if (tool.type === "web_search" || tool.type === "web_search_20250305") {
      converted.push({ type: "web_search" });
      continue;
    }
    const name = typeof tool.name === "string" ? tool.name : "";
    if (!name) {
      continue;
    }
    const def: CodexTool = {
      type: "function",
      name
    };
    if (typeof tool.description === "string") {
      def.description = tool.description;
    }
    if (isRecord(tool.input_schema)) {
      def.parameters = normalizeSchema(tool.input_schema);
    }
    converted.push(def);
  }
  return converted;
}

function openAIToolChoiceToCodex(choice: unknown): CodexRequestBody["tool_choice"] | undefined {
  if (!choice) {
    return undefined;
  }
  if (typeof choice === "string") {
    return choice;
  }
  if (isRecord(choice) && choice.type === "function" && isRecord(choice.function)) {
    const name = choice.function.name;
    return typeof name === "string" ? { type: "function", name } : undefined;
  }
  return undefined;
}

function anthropicToolChoiceToCodex(
  choice: AnthropicRequest["tool_choice"]
): CodexRequestBody["tool_choice"] | undefined {
  if (!choice) {
    return undefined;
  }
  if (choice.type === "auto") {
    return "auto";
  }
  if (choice.type === "any") {
    return "required";
  }
  if (choice.type === "tool" && choice.name) {
    return { type: "function", name: choice.name };
  }
  return undefined;
}

function thinkingEffort(thinking: AnthropicRequest["thinking"]): string | undefined {
  if (!thinking || thinking.type === "disabled") {
    return undefined;
  }
  const budget = thinking.budget_tokens ?? 0;
  if (budget >= 24000) {
    return "xhigh";
  }
  if (budget >= 10000) {
    return "high";
  }
  if (budget > 0 && budget < 4000) {
    return "low";
  }
  return "medium";
}

export function responsesToCodexRequest(body: Record<string, unknown>): CodexRequestBody {
  const request: CodexRequestBody = {
    model: resolveCodexModel(asString(body.model)),
    instructions: typeof body.instructions === "string" ? body.instructions : "You are a helpful assistant.",
    input: body.input === undefined ? "" : (body.input as CodexRequestBody["input"]),
    stream: true,
    store: false
  };
  if (isRecord(body.reasoning)) {
    request.reasoning = body.reasoning as CodexRequestBody["reasoning"];
  }
  const tools = openAIToolsToCodex(body.tools);
  if (tools.length > 0) {
    request.tools = tools;
  }
  const toolChoice = openAIToolChoiceToCodex(body.tool_choice);
  if (toolChoice) {
    request.tool_choice = toolChoice;
  }
  if (body.parallel_tool_calls !== undefined) {
    request.parallel_tool_calls = body.parallel_tool_calls !== false;
  }
  if (isRecord(body.text)) {
    request.text = body.text;
  }
  if (Array.isArray(body.include)) {
    request.include = body.include;
  }
  if (typeof body.service_tier === "string") {
    request.service_tier = body.service_tier;
  }
  if (typeof body.prompt_cache_key === "string") {
    request.prompt_cache_key = body.prompt_cache_key;
  }
  return request;
}

export function chatCompletionToCodexRequest(body: Record<string, unknown>): CodexRequestBody {
  const messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : [];
  const request: CodexRequestBody = {
    model: resolveCodexModel(asString(body.model)),
    instructions: instructionsFromMessages(messages),
    input: inputFromChatMessages(messages),
    stream: true,
    store: false
  };

  const tools = openAIToolsToCodex(body.tools);
  if (tools.length > 0) {
    request.tools = tools;
  }
  const toolChoice = openAIToolChoiceToCodex(body.tool_choice);
  if (toolChoice) {
    request.tool_choice = toolChoice;
  }
  if (isRecord(body.reasoning)) {
    request.reasoning = body.reasoning as CodexRequestBody["reasoning"];
  }

  return request;
}

export function anthropicToCodexRequest(body: AnthropicRequest): CodexRequestBody {
  const system =
    typeof body.system === "string"
      ? body.system
      : Array.isArray(body.system)
        ? body.system.map((block) => block.text).filter(Boolean).join("\n\n")
        : "You are a helpful assistant.";
  const input: CodexInputItem[] = [];
  for (const message of body.messages ?? []) {
    input.push(...anthropicContentToInputItems(message.role, message.content));
  }

  const request: CodexRequestBody = {
    model: resolveCodexModel(body.model),
    instructions: system || "You are a helpful assistant.",
    input: input.length > 0 ? input : [{ role: "user", content: "" }],
    stream: true,
    store: false
  };

  const effort = thinkingEffort(body.thinking);
  if (effort) {
    request.reasoning = { effort, summary: "auto" };
  }
  const tools = anthropicToolsToCodex(body.tools);
  if (tools.length > 0) {
    request.tools = tools;
  }
  const toolChoice = anthropicToolChoiceToCodex(body.tool_choice);
  if (toolChoice) {
    request.tool_choice = toolChoice;
  }
  request.parallel_tool_calls = true;

  return request;
}

function usageBody(usage: CodexUsageInfo): Record<string, number> {
  const total = usage.total_tokens ?? usage.input_tokens + usage.output_tokens;
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: total
  };
}

function anthropicUsage(usage: CodexUsageInfo): Record<string, number> {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens
  };
}

export function codexToResponsesBody(collected: CodexCollectedResponse, requestedModel: string): Record<string, unknown> {
  const id = collected.responseId ?? `resp_${crypto.randomUUID().replace(/-/g, "")}`;
  const output: Array<Record<string, unknown>> = [];

  if (collected.text) {
    output.push({
      id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: collected.text,
          annotations: []
        }
      ]
    });
  }

  for (const call of collected.functionCalls) {
    output.push({
      type: "function_call",
      call_id: call.callId,
      name: call.name,
      arguments: call.arguments
    });
  }

  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: requestedModel,
    output,
    output_text: collected.text,
    usage: usageBody(collected.usage)
  };
}

function chatToolCalls(calls: CodexFunctionCall[]): Array<Record<string, unknown>> {
  return calls.map((call) => ({
    id: call.callId,
    type: "function",
    function: {
      name: call.name,
      arguments: call.arguments
    }
  }));
}

export function codexToChatCompletionBody(
  collected: CodexCollectedResponse,
  requestedModel: string
): Record<string, unknown> {
  const hasTools = collected.functionCalls.length > 0;
  return {
    id: collected.responseId ?? `chatcmpl_${crypto.randomUUID().replace(/-/g, "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: collected.text || null,
          ...(hasTools ? { tool_calls: chatToolCalls(collected.functionCalls) } : {})
        },
        finish_reason: hasTools ? "tool_calls" : "stop"
      }
    ],
    usage: usageBody(collected.usage)
  };
}

export function codexToAnthropicBody(
  collected: CodexCollectedResponse,
  requestedModel: string,
  wantThinking: boolean
): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  if (wantThinking && collected.reasoning) {
    content.push({ type: "thinking", thinking: collected.reasoning });
  }
  if (collected.text) {
    content.push({ type: "text", text: collected.text });
  }
  for (const call of collected.functionCalls) {
    let input: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(call.arguments) as unknown;
      input = isRecord(parsed) ? parsed : {};
    } catch {
      input = {};
    }
    content.push({
      type: "tool_use",
      id: call.callId,
      name: call.name,
      input
    });
  }
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  return {
    id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    type: "message",
    role: "assistant",
    content,
    model: requestedModel,
    stop_reason: collected.functionCalls.length > 0 ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: anthropicUsage(collected.usage)
  };
}

function sse(event: string | null, data: unknown): string {
  return event ? `event: ${event}\ndata: ${JSON.stringify(data)}\n\n` : `data: ${JSON.stringify(data)}\n\n`;
}

function usageDelta(usage: CodexUsageInfo): Record<string, number> {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens
  };
}

export async function* streamCodexToAnthropicSSE(
  response: Response,
  requestedModel: string,
  wantThinking: boolean
): AsyncGenerator<string> {
  const messageId = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  let contentIndex = 0;
  let textOpen = false;
  let thinkingOpen = false;
  let hasTools = false;
  let usage: CodexUsageInfo = { input_tokens: 0, output_tokens: 0 };
  const callArgDeltas = new Set<string>();

  const closeText = function* closeTextBlock() {
    if (textOpen) {
      yield sse("content_block_stop", { type: "content_block_stop", index: contentIndex });
      contentIndex += 1;
      textOpen = false;
    }
  };
  const closeThinking = function* closeThinkingBlock() {
    if (thinkingOpen) {
      yield sse("content_block_stop", { type: "content_block_stop", index: contentIndex });
      contentIndex += 1;
      thinkingOpen = false;
    }
  };
  const ensureText = function* ensureTextBlock() {
    if (!textOpen) {
      yield* closeThinking();
      yield sse("content_block_start", {
        type: "content_block_start",
        index: contentIndex,
        content_block: { type: "text", text: "" }
      });
      textOpen = true;
    }
  };

  yield sse("message_start", {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      content: [],
      model: requestedModel,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 }
    }
  });

  for await (const event of iterateCodexEvents(response)) {
    if (event.error) {
      yield sse("error", { type: "error", error: { type: "api_error", message: event.error } });
      continue;
    }
    if (event.usage) {
      usage = event.usage;
    }
    if (event.reasoningDelta && wantThinking) {
      yield* closeText();
      if (!thinkingOpen) {
        yield sse("content_block_start", {
          type: "content_block_start",
          index: contentIndex,
          content_block: { type: "thinking", thinking: "" }
        });
        thinkingOpen = true;
      }
      yield sse("content_block_delta", {
        type: "content_block_delta",
        index: contentIndex,
        delta: { type: "thinking_delta", thinking: event.reasoningDelta }
      });
    }
    if (event.textDelta) {
      yield* ensureText();
      yield sse("content_block_delta", {
        type: "content_block_delta",
        index: contentIndex,
        delta: { type: "text_delta", text: event.textDelta }
      });
    }
    if (event.functionCallStart) {
      hasTools = true;
      yield* closeThinking();
      yield* closeText();
      yield sse("content_block_start", {
        type: "content_block_start",
        index: contentIndex,
        content_block: {
          type: "tool_use",
          id: event.functionCallStart.callId,
          name: event.functionCallStart.name,
          input: {}
        }
      });
    }
    if (event.functionCallDelta) {
      callArgDeltas.add(event.functionCallDelta.callId);
      yield sse("content_block_delta", {
        type: "content_block_delta",
        index: contentIndex,
        delta: { type: "input_json_delta", partial_json: event.functionCallDelta.delta }
      });
    }
    if (event.functionCallDone) {
      if (!callArgDeltas.has(event.functionCallDone.callId)) {
        yield sse("content_block_delta", {
          type: "content_block_delta",
          index: contentIndex,
          delta: { type: "input_json_delta", partial_json: event.functionCallDone.arguments }
        });
      }
      yield sse("content_block_stop", { type: "content_block_stop", index: contentIndex });
      contentIndex += 1;
    }
  }

  yield* closeThinking();
  yield* closeText();
  yield sse("message_delta", {
    type: "message_delta",
    delta: { stop_reason: hasTools ? "tool_use" : "end_turn" },
    usage: usageDelta(usage)
  });
  yield sse("message_stop", { type: "message_stop" });
}

export async function* streamCodexToChatCompletionSSE(
  response: Response,
  requestedModel: string
): AsyncGenerator<string> {
  const id = `chatcmpl_${crypto.randomUUID().replace(/-/g, "")}`;
  let hasTools = false;
  const toolCallIndexes = new Map<string, number>();

  for await (const event of iterateCodexEvents(response)) {
    if (event.error) {
      yield sse(null, { error: { message: event.error, type: "upstream_error" } });
      continue;
    }
    if (event.textDelta) {
      yield sse(null, {
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: requestedModel,
        choices: [{ index: 0, delta: { content: event.textDelta }, finish_reason: null }]
      });
    }
    if (event.functionCallStart) {
      hasTools = true;
      const toolIndex = toolCallIndexes.size;
      toolCallIndexes.set(event.functionCallStart.callId, toolIndex);
      yield sse(null, {
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: requestedModel,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: toolIndex,
                  id: event.functionCallStart.callId,
                  type: "function",
                  function: { name: event.functionCallStart.name, arguments: "" }
                }
              ]
            },
            finish_reason: null
          }
        ]
      });
    }
    if (event.functionCallDelta) {
      yield sse(null, {
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: requestedModel,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: toolCallIndexes.get(event.functionCallDelta.callId) ?? 0,
                  function: { arguments: event.functionCallDelta.delta }
                }
              ]
            },
            finish_reason: null
          }
        ]
      });
    }
  }

  yield sse(null, {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [{ index: 0, delta: {}, finish_reason: hasTools ? "tool_calls" : "stop" }]
  });
  yield "data: [DONE]\n\n";
}
