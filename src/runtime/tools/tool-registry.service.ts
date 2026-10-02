import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ExecutiveBriefTool } from './builtin/executive-brief.tool';
import { KnowledgeSearchTool } from './builtin/knowledge-search.tool';
import { PortfolioUpdateTaskStatusTool } from './builtin/portfolio-update-task-status.tool';
import { RuntimeInspectRunTool } from './builtin/runtime-inspect-run.tool';
import { ToolAuthorizationService } from './tool-authorization.service';
import type {
  RuntimeTool,
  RuntimeToolDefinition,
} from './tool.types';

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private readonly tools: Map<string, RuntimeTool>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: ToolAuthorizationService,
    inspectRun: RuntimeInspectRunTool,
    updateTaskStatus: PortfolioUpdateTaskStatusTool,
    knowledgeSearch: KnowledgeSearchTool,
    executiveBrief: ExecutiveBriefTool,
  ) {
    this.tools = new Map<string, RuntimeTool>([
      [inspectRun.definition.code, inspectRun],
      [
        updateTaskStatus.definition.code,
        updateTaskStatus,
      ],
      [
        knowledgeSearch.definition.code,
        knowledgeSearch,
      ],
      [
        executiveBrief.definition.code,
        executiveBrief,
      ],
    ]);
  }

  async onModuleInit(): Promise<void> {
    for (const tool of this.tools.values()) {
      const definition = tool.definition;

      await this.prisma.toolDefinitionRecord.upsert({
        where: {
          code_version: {
            code: definition.code,
            version: definition.version,
          },
        },
        create: {
          code: definition.code,
          version: definition.version,
          description: definition.description,
          capability: definition.capability,
          inputSchema:
            definition.inputSchema as Prisma.InputJsonValue,
          outputSchema:
            (definition.outputSchema ??
              undefined) as Prisma.InputJsonValue | undefined,
          sideEffect: definition.sideEffect,
          defaultRisk: definition.defaultRisk,
          enabled: true,
          timeoutMs: definition.timeoutMs,
        },
        update: {
          description: definition.description,
          capability: definition.capability,
          inputSchema:
            definition.inputSchema as Prisma.InputJsonValue,
          outputSchema:
            (definition.outputSchema ??
              undefined) as Prisma.InputJsonValue | undefined,
          sideEffect: definition.sideEffect,
          defaultRisk: definition.defaultRisk,
          timeoutMs: definition.timeoutMs,
        },
      });
    }
  }

  resolve(code: string): RuntimeTool {
    const tool = this.tools.get(code);
    if (!tool) {
      throw new NotFoundException(
        `Tool não registrado: ${code}`,
      );
    }
    return tool;
  }

  list(): RuntimeToolDefinition[] {
    return Array.from(this.tools.values()).map(
      (tool) => tool.definition,
    );
  }

  async listGranted(
    tenantId: string,
    agentId: string,
  ): Promise<RuntimeToolDefinition[]> {
    const authorizedCodes =
      await this.authorization.authorizedToolCodes(
        tenantId,
        agentId,
      );

    if (!authorizedCodes.length) {
      return [];
    }

    const persisted =
      await this.prisma.toolDefinitionRecord.findMany({
        where: {
          code: { in: authorizedCodes },
          enabled: true,
        },
      });

    const persistedKey = new Set(
      persisted.map(
        (item) => `${item.code}@${item.version}`,
      ),
    );

    const definitions: RuntimeToolDefinition[] = [];

    for (const code of authorizedCodes) {
      const tool = this.tools.get(code);
      if (!tool) continue;

      const definition = tool.definition;
      if (
        !persistedKey.has(
          `${definition.code}@${definition.version}`,
        )
      ) {
        continue;
      }

      definitions.push(definition);
    }

    return definitions.sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }

}
