// @ts-nocheck
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { HierarchicalMemory } from '../config/memory.js';
import { GEMINI_DIR, makeRelative } from '../utils/paths.js';
import { ApprovalMode } from '../policy/types.js';
import * as snippets from './snippets.js';
import * as legacySnippets from './snippets.legacy.js';
import {
  resolvePathFromEnv,
  applySubstitutions,
  isSectionEnabled,
  type ResolvedPath,
} from './utils.js';
import { CodebaseInvestigatorAgent } from '../agents/codebase-investigator.js';
import { isGitRepository } from '../utils/gitUtils.js';
import {
  WRITE_TODOS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  AGENT_TOOL_NAME,
} from '../tools/tool-names.js';
import { resolveModel, supportsModernFeatures } from '../config/models.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import {
  getAllGeminiMdFilenames,
  getGlobalMemoryFilePath,
  getProjectMemoryIndexFilePath,
} from '../tools/memoryTool.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';

/**
 * Orchestrates prompt generation by gathering context and building options.
 */
export class PromptProvider {
  /**
   * Generates the core system prompt.
   */
  getCoreSystemPrompt(
    context: AgentLoopContext,
    userMemory?: string | HierarchicalMemory,
    interactiveOverride?: boolean,
    topicUpdateNarrationOverride?: boolean,
  ): string {

    return `Kamu Stefanie, ceweknya Mas Irza. Cewek ramah, ceplas ceplos, gaul, to the point. Panggil user: Sayang/ Mas Irza. jawab pake Indo santai+jokes tipis kalo perlu. kalo dipanggil "stef", "step", "tepi","tep","stefi" itu kamu.
    Keahlian: Expert Terraform, K8s, AWS, Golang. Selalu kasih HCL clean, cek best practice security & cost. Kalo jelasin pake analogi gampang (EOF style), jawab singkat dan padat`;}

  getCompressionPrompt(context: AgentLoopContext): string {
    const desiredModel = resolveModel(
      context.config.getActiveModel(),
      context.config.getGemini31LaunchedSync?.() ?? false,
      false,
      context.config.getHasAccessToPreviewModel?.() ?? true,
      context.config,
      context.config.hasGemini35FlashGAAccess?.() ?? false,
    );
    const isModernModel = supportsModernFeatures(desiredModel);
    const activeSnippets = isModernModel ? snippets : legacySnippets;
    return activeSnippets.getCompressionPrompt(
      context.config.getApprovedPlanPath(),
    );
  }

  private withSection<T>(
    key: string,
    factory: () => T,
    guard: boolean = true,
  ): T | undefined {
    return guard && isSectionEnabled(key) ? factory() : undefined;
  }

  private maybeWriteSystemMd(
    basePrompt: string,
    resolution: ResolvedPath,
    defaultPath: string,
  ): void {
    const writeSystemMdResolution = resolvePathFromEnv(
      process.env['GEMINI_WRITE_SYSTEM_MD'],
    );
    if (writeSystemMdResolution.value && !writeSystemMdResolution.isDisabled) {
      const writePath = writeSystemMdResolution.isSwitch
        ? defaultPath
        : writeSystemMdResolution.value;
      fs.mkdirSync(path.dirname(writePath), { recursive: true });
      fs.writeFileSync(writePath, basePrompt);
    }
  }
}

function normalizePromptPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

// --- Internal Context Helpers ---

function getSandboxMode(): snippets.SandboxMode {
  if (process.env['SANDBOX'] === 'sandbox-exec') return 'macos-seatbelt';
  if (process.env['SANDBOX']) return 'generic';
  return 'outside';
}
