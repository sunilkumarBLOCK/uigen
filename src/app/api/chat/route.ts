import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getLanguageModel } from "@/lib/provider";
import { generationPrompt } from "@/lib/prompts/generation";

export async function POST(req: Request) {
  const {
    messages: uiMessages,
    files,
    projectId,
  }: {
    messages: UIMessage[];
    files: Record<string, FileNode>;
    projectId?: string;
  } = await req.json();

  // Convert UI messages to model messages for streamText
  const modelMessages = await convertToModelMessages(uiMessages);

  // Add system prompt at the beginning
  modelMessages.unshift({
    role: "system",
    content: generationPrompt,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  });

  // Reconstruct the VirtualFileSystem from serialized data
  const fileSystem = new VirtualFileSystem();
  fileSystem.deserializeFromNodes(files);

  const model = getLanguageModel();
  // Use fewer steps for mock provider to prevent repetition
  const isMockProvider = !process.env.ANTHROPIC_API_KEY;
  const result = streamText({
    model,
    messages: modelMessages,
    maxOutputTokens: 10_000,
    stopWhen: stepCountIs(isMockProvider ? 4 : 40),
    onError: (err: unknown) => {
      console.error(err);
    },
    tools: {
      str_replace_editor: buildStrReplaceTool(fileSystem),
      file_manager: buildFileManagerTool(fileSystem),
    },
    onFinish: async ({ steps }) => {
      // Save to project if projectId is provided and user is authenticated
      if (projectId) {
        try {
          // Check if user is authenticated
          const session = await getSession();
          if (!session) {
            console.error("User not authenticated, cannot save project");
            return;
          }

          // Build UIMessage-format assistant message from response steps
          const assistantParts: Array<Record<string, unknown>> = [];
          for (const step of steps) {
            if (step.text) {
              assistantParts.push({ type: "text", text: step.text });
            }
            for (const tc of step.toolCalls) {
              const result = step.toolResults.find(
                (r) => r.toolCallId === tc.toolCallId
              );
              assistantParts.push({
                type: "tool-invocation",
                toolInvocation: {
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  args: tc.args,
                  state: "result",
                  result: result?.result,
                },
              });
            }
          }

          const allMessages = [
            ...uiMessages,
            ...(assistantParts.length > 0
              ? [
                  {
                    id: crypto.randomUUID(),
                    role: "assistant" as const,
                    parts: assistantParts,
                  },
                ]
              : []),
          ];

          await prisma.project.update({
            where: {
              id: projectId,
              userId: session.userId,
            },
            data: {
              messages: JSON.stringify(allMessages),
              data: JSON.stringify(fileSystem.serialize()),
            },
          });
        } catch (error) {
          console.error("Failed to save project data:", error);
        }
      }
    },
  });

  return result.toUIMessageStreamResponse();
}

export const maxDuration = 120;
