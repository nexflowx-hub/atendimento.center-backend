import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RuntimeActionService } from './actions/runtime-action.service';
import { ApprovalController } from './approval/approval.controller';
import { ApprovalEngineService } from './approval/approval-engine.service';
import { ModelGateway } from './model/model-gateway.service';
import { OpenRouterProvider } from './model/providers/openrouter.provider';
import { PolicyEngineService } from './policy/policy-engine.service';
import { RuntimeController } from './runtime.controller';
import { RuntimeRunService } from './runtime-run.service';
import { PortfolioUpdateTaskStatusTool } from './tools/builtin/portfolio-update-task-status.tool';
import { RuntimeInspectRunTool } from './tools/builtin/runtime-inspect-run.tool';
import { RuntimeToolsController } from './tools/runtime-tools.controller';
import { ToolRegistryService } from './tools/tool-registry.service';
import { ToolRunnerService } from './tools/tool-runner.service';
import { ExecutiveModule } from '../executive/executive.module';
import { ExecutiveBriefTool } from './tools/builtin/executive-brief.tool';
import { KnowledgeSearchTool } from './tools/builtin/knowledge-search.tool';
import { ToolAuthorizationService } from './tools/tool-authorization.service';

@Module({
  imports: [
    AuthModule,
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 3,
    }),
    ExecutiveModule,
  ],
  controllers: [
    RuntimeController,
    RuntimeToolsController,
    ApprovalController,
  ],
  providers: [
    OpenRouterProvider,
    ModelGateway,
    RuntimeRunService,
    RuntimeInspectRunTool,
    PortfolioUpdateTaskStatusTool,
    ToolRegistryService,
    PolicyEngineService,
    ToolRunnerService,
    RuntimeActionService,
    ApprovalEngineService,
    ExecutiveBriefTool,
    KnowledgeSearchTool,
    ToolAuthorizationService,
  ],
  exports: [
    ModelGateway,
    RuntimeRunService,
    ToolRegistryService,
    PolicyEngineService,
    RuntimeActionService,
    ApprovalEngineService,
  ],
})
export class RuntimeModule {}
