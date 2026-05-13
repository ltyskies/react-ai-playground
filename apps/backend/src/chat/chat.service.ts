/**
 * @file chat.service.ts
 * @description 聊天服务，处理 AI 对话核心业务逻辑
 * @module 聊天模块
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Result } from 'src/common/Result';
import { User } from '../user/entities/user.entity';
import { ConversationRuntimeMemoryService } from './conversation-runtime-memory.service';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageRole, StreamStatus } from './entities/message.entity';
import type { ConversationRuntimeMessage } from './types/conversation-runtime-memory.type';
import type { ConversationWorkspace } from './types/conversation-workspace.type';

/** 默认会话标题候选列表，用于判断标题是否仍可被首轮消息自动覆盖。 */
const DEFAULT_CONVERSATION_TITLES = ['New Chat', '新对话'];
/** 已完成消息回放时，每个分片返回的最大字符数。 */
const REPLAY_CHUNK_SIZE = 120;
/** 未启用摘要时，旧版历史回放最多保留的消息条数。 */
const LEGACY_PROMPT_MESSAGE_LIMIT = 20;
/** 达到该轮次后开始考虑把历史对话折叠为摘要。 */
const SUMMARY_TRIGGER_ROUNDS = 20;
/** 无论摘要是否存在，都保留最近若干轮原始消息供模型直接参考。 */
const RAW_HISTORY_RETENTION_ROUNDS = 8;
/** 单次摘要合并处理的轮次数，避免一次提交过长上下文。 */
const SUMMARY_BATCH_ROUNDS = 10;
/** 主对话模型的系统提示词，约束代码回复格式与文件输出约定。 */
const CODING_ASSISTANT_SYSTEM_PROMPT = `You are a helpful AI coding assistant. When providing code changes:

1. If you provide a complete file replacement, use this format:
\`\`\`language:filename.ext
// complete code here
\`\`\`

2. IMPORTANT: The file system is FLAT. Use simple filenames like "App.tsx", "main.tsx", "utils.ts" without any paths like "src/" or "components/".

3. The filename after the colon will be used to automatically apply the code to the correct file.

4. Always provide complete, working code that can be directly applied to the file.

5. If the file doesn't exist, it will be created automatically.`;
/** 对话摘要作为背景记忆注入模型时使用的系统提示词。 */
const CONVERSATION_MEMORY_SYSTEM_PROMPT = `Conversation compressed memory (internal, may be incomplete). Use this as background context only.
If it conflicts with the recent raw conversation or the current user request, follow the recent raw conversation and the current user request.

`;
// 长对话摘要统一要求固定 Markdown 标题，便于后续轮次稳定复用。
const CONVERSATION_SUMMARY_SYSTEM_PROMPT = `You maintain a rolling memory summary for a coding conversation.
Return a complete Markdown document in Chinese and keep exactly these top-level headings:
## 当前目标
## 已确认需求
## 关键约束
## 重要文件/接口
## 已做决策
## 未解决问题
## 用户偏好

Rules:
- Keep only stable information that is useful for future reasoning.
- Remove greetings, repetition, and temporary chatter.
- Do not invent facts that are not grounded in the conversation.
- If the new rounds conflict with the previous summary, update the summary based on the new rounds.
- Mention important filenames, interfaces, APIs, constraints, and pending decisions when present.
- If a section has no useful content, write "- 无".`;

/**
 * 流式生成选项
 * @description 控制生成过程中的中断和附加行为
 */
interface GenerateStreamOptions {
  /** 中断信号，通常在客户端断开连接时触发 */
  signal?: AbortSignal;
}

/**
 * 保存消息选项
 * @description 补充消息的请求标识与流式状态
 */
interface SaveMessageOptions {
  /** 请求 ID，用于把同一轮用户消息与助手消息关联起来 */
  requestId?: string | null;
  /** 写入数据库时附带的流式状态 */
  streamStatus?: StreamStatus;
}

/**
 * 已完成的会话轮次
 * @description 由一条用户消息和一条助手消息组成，可用于摘要折叠
 */
interface CompletedConversationRound {
  /** 轮次对应的请求 ID */
  requestId: string;
  /** 该轮次中的用户消息 */
  userMessage: ConversationRuntimeMessage;
  /** 该轮次中的助手消息 */
  assistantMessage: ConversationRuntimeMessage;
}

/**
 * 会话记忆状态
 * @description 汇总后的长记忆摘要与仍需原样保留的最近轮次
 */
interface ConversationMemoryState {
  /** 供模型读取的对话摘要 */
  memorySummary: string;
  /** 尚未被折叠进摘要的最近完整轮次 */
  recentRounds: CompletedConversationRound[];
}

/**
 * 提示词历史上下文
 * @description 描述真正发给模型的摘要记忆和原始消息历史
 */
interface PromptHistoryContext {
  /** 压缩后的长对话摘要 */
  memorySummary: string;
  /** 仍需直接注入模型的原始消息列表 */
  rawHistoryMessages: ConversationRuntimeMessage[];
}

/**
 * 聊天服务
 * @description 负责会话管理、上下文构造、流式回复生成以及长对话摘要维护
 * @decorator @Injectable() - 标记为可注入服务
 */
@Injectable()
export class ChatService {
  /** 主对话模型，用于生成聊天回复 */
  private chatModel: ChatOpenAI;
  /** 摘要模型，用于压缩长对话记忆 */
  private summaryModel: ChatOpenAI;

  /**
   * 构造函数，注入仓库与配置依赖
   * @param conversationRepo - 会话仓库
   * @param messageRepo - 消息仓库
   * @param userRepo - 用户仓库
   * @param configService - 配置服务
   * @param conversationRuntimeMemoryService - 会话运行时内存服务
   */
  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private configService: ConfigService,
    private conversationRuntimeMemoryService: ConversationRuntimeMemoryService,
  ) {
    const apiKey = this.configService.get<string>('ai.deepseek.apiKey');
    const baseURL = this.configService.get<string>('ai.deepseek.baseUrl');
    const modelName = this.configService.get<string>('ai.deepseek.model');

    this.chatModel = new ChatOpenAI({
      configuration: {
        baseURL,
      },
      apiKey,
      modelName,
      streaming: true,
      temperature: 0.7,
    });

    this.summaryModel = new ChatOpenAI({
      configuration: {
        baseURL,
      },
      apiKey,
      modelName,
      streaming: false,
      temperature: 0.2,
    });
  }

  /**
   * 创建新会话
   * @description 为当前用户创建一条空白对话记录，并初始化会话记忆字段
   * @param userId - 当前登录用户 ID
   * @returns 创建成功后的会话 ID
   */
  async createConversation(userId?: number) {
    const conversation = this.conversationRepo.create({
      userId: this.getRequiredUserId(userId),
      title: 'New Chat',
      workspaceSnapshot: null,
      memorySummary: null,
      summarizedUntilMessageId: null,
      memoryUpdatedAt: null,
    });
    const savedConversation = await this.conversationRepo.save(conversation);

    return Result.successWithData(savedConversation.id);
  }

  /**
   * 获取会话列表
   * @description 查询当前用户全部会话，并按更新时间倒序返回简要信息
   * @param userId - 当前登录用户 ID
   * @returns 会话列表
   */
  async getConversationList(userId?: number) {
    const requiredUserId = this.getRequiredUserId(userId);
    const conversations = await this.conversationRepo.find({
      where: { userId: requiredUserId },
      order: { updatedAt: 'DESC' },
    });

    return Result.successWithData(
      conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      })),
    );
  }

  /**
   * 删除会话
   * @description 删除指定会话（仅删除会话记录，不删除关联的消息）
   * @param userId - 当前登录用户 ID
   * @param conversationId - 会话 ID
   * @returns 删除结果
   */
  async deleteConversation(userId: number | undefined, conversationId: number) {
    const conversation = await this.getAuthorizedConversation(
      userId,
      conversationId,
    );

    await this.conversationRepo.remove(conversation);

    return Result.successWithData({ deleted: true });
  }

  /**
   * 获取会话详情
   * @description 读取指定会话及其消息，并同步刷新运行时内存缓存
   * @param userId - 当前登录用户 ID
   * @param conversationId - 会话 ID
   * @returns 会话详情、消息列表与工作区快照
   */
  async getConversationDetail(
    userId: number | undefined,
    conversationId: number,
  ) {
    const conversation = await this.getAuthorizedConversation(
      userId,
      conversationId,
      ['messages'],
    );
    const runtimeMessages = [...(conversation.messages || [])]
      .sort((a, b) => this.compareMessages(a, b))
      .map((message) => this.toRuntimeMessage(message));

    this.conversationRuntimeMemoryService.hydrate(
      conversation.id,
      runtimeMessages,
    );

    const messages = runtimeMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: this.getDisplayContent(message),
      requestId: message.requestId || null,
      status: message.streamStatus || StreamStatus.COMPLETED,
      createdAt: message.createdAt,
    }));

    return Result.successWithData({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages,
      workspaceSnapshot: conversation.workspaceSnapshot || null,
    });
  }

  /**
   * 保存会话工作区
   * @description 持久化当前会话的编辑器文件快照与上下文文件选择
   * @param userId - 当前登录用户 ID
   * @param conversationId - 会话 ID
   * @param workspace - 工作区快照
   * @returns 最新保存的工作区数据
   */
  async saveConversationWorkspace(
    userId: number | undefined,
    conversationId: number,
    workspace: ConversationWorkspace,
  ) {
    const conversation = await this.getAuthorizedConversation(
      userId,
      conversationId,
    );
    conversation.workspaceSnapshot = workspace;
    await this.touchConversation(conversation);

    return Result.successWithData(conversation.workspaceSnapshot);
  }

  /**
   * 生成流式回复
   * @description 组装用户规则、历史消息、工作区上下文后调用模型流式生成助手回复
   * @param userId - 当前登录用户 ID
   * @param conversationId - 会话 ID
   * @param content - 用户输入内容
   * @param workspace - 当前工作区快照
   * @param requestId - 本轮请求唯一标识
   * @param options - 流式生成附加选项
   * @returns 回复内容的异步生成器
   */
  async generateStream(
    userId: number | undefined,
    conversationId: number,
    content: string,
    workspace: ConversationWorkspace,
    requestId: string,
    options: GenerateStreamOptions = {},
  ): Promise<AsyncGenerator<string>> {
    const normalizedRequestId = requestId.trim();
    if (!normalizedRequestId) {
      throw new BadRequestException('Missing requestId');
    }

    const conversation = await this.getAuthorizedConversation(
      userId,
      conversationId,
    );

    conversation.workspaceSnapshot = workspace;
    await this.touchConversation(conversation);

    const history = await this.getConversationRuntimeMessages(conversationId);
    const completedAssistantMessage = this.findMessageByRequestId(
      history,
      normalizedRequestId,
      MessageRole.ASSISTANT,
    );
    if (completedAssistantMessage?.streamStatus === StreamStatus.COMPLETED) {
      await this.updateRequestStatus(
        conversationId,
        normalizedRequestId,
        StreamStatus.COMPLETED,
      );
      return this.createReplayGenerator(completedAssistantMessage.content);
    }

    const savedUserMessage = await this.createOrReuseUserMessage(
      conversation,
      history,
      conversationId,
      normalizedRequestId,
      content,
    );

    const promptHistory =
      await this.getConversationRuntimeMessages(conversationId);
    const promptRules = await this.getUserPromptRules(userId);
    const promptHistoryContext = await this.buildPromptHistoryContext(
      conversation,
      promptHistory,
      savedUserMessage.id,
    );

    const messages: BaseMessage[] = [
      new SystemMessage(CODING_ASSISTANT_SYSTEM_PROMPT),
      ...(promptRules
        ? [
            new SystemMessage(
              `Follow these user-specific rules for every response unless a higher-priority system instruction conflicts:\n${promptRules}`,
            ),
          ]
        : []),
      ...(promptHistoryContext.memorySummary
        ? [
            new SystemMessage(
              `${CONVERSATION_MEMORY_SYSTEM_PROMPT}${promptHistoryContext.memorySummary}`,
            ),
          ]
        : []),
      ...promptHistoryContext.rawHistoryMessages.map((message) =>
        this.toModelHistoryMessage(message),
      ),
      new HumanMessage(
        this.buildUserPrompt(savedUserMessage.content, workspace),
      ),
    ];

    const stream = await this.chatModel.stream(messages);
    return this.createModelStreamGenerator({
      conversation,
      conversationId,
      requestId: normalizedRequestId,
      stream,
      signal: options.signal,
    });
  }

  /**
   * 校验用户 ID
   * @description 未登录或缺少用户标识时抛出无权限异常
   * @param userId - 当前登录用户 ID
   * @returns 已确认可用的用户 ID
   */
  private getRequiredUserId(userId?: number) {
    if (!userId) {
      throw new ForbiddenException('Forbidden');
    }

    return userId;
  }

  /**
   * 获取用户级提示规则
   * @description 读取用户自定义 promptRules，并去掉两端空白
   * @param userId - 当前登录用户 ID
   * @returns 用户级规则文本，未配置时返回空字符串
   */
  private async getUserPromptRules(userId?: number) {
    const user = await this.userRepo.findOne({
      where: { id: this.getRequiredUserId(userId) },
    });

    if (!user?.promptRules) {
      return '';
    }

    return user.promptRules.trim();
  }

  /**
   * 从数据库加载会话历史
   * @description 按创建时间和主键顺序读取完整消息记录
   * @param conversationId - 会话 ID
   * @returns 数据库中的消息实体列表
   */
  private async loadConversationHistoryFromDatabase(conversationId: number) {
    return this.messageRepo.find({
      where: { conversationId },
      order: {
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
  }

  /**
   * 获取运行时消息历史
   * @description 优先从内存缓存读取，会在缓存未命中时自动回库并回填
   * @param conversationId - 会话 ID
   * @returns 运行时消息列表
   */
  private async getConversationRuntimeMessages(conversationId: number) {
    const state = await this.conversationRuntimeMemoryService.getOrHydrate(
      conversationId,
      async () => {
        const history =
          await this.loadConversationHistoryFromDatabase(conversationId);
        return history.map((message) => this.toRuntimeMessage(message));
      },
    );

    return state.messages;
  }

  /**
   * 构建模型所需的历史上下文
   * @description 根据对话长度决定使用原始历史还是“摘要 + 最近轮次”的组合模式
   * @param conversation - 当前会话实体
   * @param history - 当前会话全部运行时消息
   * @param currentUserMessageId - 当前用户消息 ID，用于避免重复注入
   * @returns 可直接传给模型的历史上下文
   */
  private async buildPromptHistoryContext(
    conversation: Conversation,
    history: ConversationRuntimeMessage[],
    currentUserMessageId: number,
  ): Promise<PromptHistoryContext> {
    // 先准备旧的兜底上下文，后续如果摘要刷新失败可以直接回退。
    const legacyHistory = this.buildLegacyPromptHistory(
      history,
      currentUserMessageId,
    );

    try {
      const completedRounds = this.collectCompletedRounds(history);
      const hasConversationMemory = Boolean(conversation.memorySummary?.trim());

      if (
        !hasConversationMemory &&
        completedRounds.length <= SUMMARY_TRIGGER_ROUNDS
      ) {
        return {
          memorySummary: '',
          rawHistoryMessages: this.buildShortConversationHistory(
            history,
            currentUserMessageId,
          ),
        };
      }

      const memoryState = await this.ensureConversationMemory(
        conversation,
        completedRounds,
      );

      return {
        memorySummary: memoryState.memorySummary,
        rawHistoryMessages: this.flattenCompletedRounds(
          memoryState.recentRounds,
        ),
      };
    } catch (error) {
      console.error(
        `Failed to refresh conversation memory for conversation ${conversation.id}:`,
        error,
      );

      return {
        memorySummary: '',
        rawHistoryMessages: legacyHistory,
      };
    }
  }

  /**
   * 获取用户有权访问的会话
   * @description 读取会话并校验归属关系，不存在或无权限时抛出异常
   * @param userId - 当前登录用户 ID
   * @param conversationId - 会话 ID
   * @param relations - 需要额外加载的关联关系
   * @returns 已通过权限校验的会话实体
   */
  private async getAuthorizedConversation(
    userId: number | undefined,
    conversationId: number,
    relations: string[] = [],
  ) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations,
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== this.getRequiredUserId(userId)) {
      throw new ForbiddenException('Forbidden');
    }

    return conversation;
  }

  /**
   * 获取消息展示文本
   * @description 对旧版带上下文封装的用户消息做兼容处理，只提取实际提问内容
   * @param message - 运行时消息
   * @returns 面向界面与摘要使用的消息正文
   */
  private getDisplayContent(message: ConversationRuntimeMessage) {
    if (message.role !== MessageRole.USER) {
      return message.content;
    }

    const legacyQuestionMatch = message.content.match(
      /User Question:\s*([\s\S]+)$/i,
    );

    if (legacyQuestionMatch?.[1]) {
      return legacyQuestionMatch[1].trim();
    }

    return message.content;
  }

  /**
   * 转换为模型历史消息
   * @description 根据消息角色映射为 LangChain 对应的消息类型
   * @param message - 运行时消息
   * @returns 模型可识别的历史消息对象
   */
  private toModelHistoryMessage(message: ConversationRuntimeMessage) {
    if (message.role === MessageRole.USER) {
      return new HumanMessage(this.getDisplayContent(message));
    }

    if (message.role === MessageRole.SYSTEM) {
      return new SystemMessage(message.content);
    }

    return new AIMessage(message.content);
  }

  /**
   * 构建用户提示词
   * @description 把用户当前问题与选中的上下文文件拼接成发给模型的最终输入
   * @param content - 用户输入内容
   * @param workspace - 当前工作区快照
   * @returns 最终用户提示词
   */
  private buildUserPrompt(content: string, workspace: ConversationWorkspace) {
    const uniqueContextFiles = Array.from(
      new Set(workspace.contextFiles || []),
    ).filter((fileName) => workspace.files?.[fileName]);

    if (uniqueContextFiles.length === 0) {
      return content;
    }

    const contextContent = uniqueContextFiles
      .map((fileName) => {
        const file = workspace.files[fileName];
        return `File: ${fileName}\n\`\`\`${file.language}\n${file.value}\n\`\`\``;
      })
      .join('\n\n');

    return `Context Files:\n${contextContent}\n\nUser Question: ${content}`;
  }

  /**
   * 构建旧版历史上下文
   * @description 在摘要机制不可用时，仅保留最近固定条数消息作为兜底历史
   * @param history - 完整运行时消息历史
   * @param currentUserMessageId - 当前用户消息 ID
   * @returns 截断后的历史消息列表
   */
  private buildLegacyPromptHistory(
    history: ConversationRuntimeMessage[],
    currentUserMessageId: number,
  ) {
    return history
      .slice(-LEGACY_PROMPT_MESSAGE_LIMIT)
      .filter(
        (message) =>
          message.id !== currentUserMessageId &&
          this.shouldIncludeInPromptHistory(message, currentUserMessageId),
      );
  }

  /**
   * 构建短对话历史
   * @description 对轮次尚少的会话保留全部有效历史，不额外触发摘要折叠
   * @param history - 完整运行时消息历史
   * @param currentUserMessageId - 当前用户消息 ID
   * @returns 可直接注入模型的短对话历史
   */
  private buildShortConversationHistory(
    history: ConversationRuntimeMessage[],
    currentUserMessageId: number,
  ) {
    return history.filter(
      (message) =>
        message.id !== currentUserMessageId &&
        this.shouldIncludeInPromptHistory(message, currentUserMessageId),
    );
  }

  /**
   * 收集已完成轮次
   * @description 根据 requestId 把已完成的用户消息与助手消息配对成完整轮次
   * @param history - 完整运行时消息历史
   * @returns 按时间排序后的完整对话轮次
   */
  private collectCompletedRounds(history: ConversationRuntimeMessage[]) {
    const roundsByRequestId = new Map<
      string,
      {
        requestId: string;
        userMessage?: ConversationRuntimeMessage;
        assistantMessage?: ConversationRuntimeMessage;
      }
    >();

    for (const message of history) {
      if (
        !message.requestId ||
        message.streamStatus !== StreamStatus.COMPLETED ||
        (message.role !== MessageRole.USER &&
          message.role !== MessageRole.ASSISTANT)
      ) {
        continue;
      }

      const round = roundsByRequestId.get(message.requestId) || {
        requestId: message.requestId,
      };

      if (message.role === MessageRole.USER && !round.userMessage) {
        round.userMessage = message;
      }

      if (message.role === MessageRole.ASSISTANT && !round.assistantMessage) {
        round.assistantMessage = message;
      }

      roundsByRequestId.set(message.requestId, round);
    }

    return Array.from(roundsByRequestId.values())
      .filter((round): round is CompletedConversationRound =>
        Boolean(round.userMessage && round.assistantMessage),
      )
      .sort((a, b) => this.compareMessages(a.userMessage, b.userMessage));
  }

  /**
   * 比较消息顺序
   * @description 先按创建时间排序，时间相同则按消息 ID 排序，保证顺序稳定
   * @param a - 左侧消息
   * @param b - 右侧消息
   * @returns 排序比较结果
   */
  private compareMessages(
    a: ConversationRuntimeMessage,
    b: ConversationRuntimeMessage,
  ) {
    const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return a.id - b.id;
  }

  /**
   * 展开完整轮次
   * @description 把轮次数组还原为“用户消息 + 助手消息”的线性历史列表
   * @param rounds - 已完成轮次列表
   * @returns 线性消息数组
   */
  private flattenCompletedRounds(rounds: CompletedConversationRound[]) {
    return rounds.flatMap((round) => [
      round.userMessage,
      round.assistantMessage,
    ]);
  }

  /**
   * 获取轮次最大消息 ID
   * @description 用于判断某轮是否已经被折叠进摘要
   * @param round - 单个已完成轮次
   * @returns 该轮次涉及消息中的最大主键 ID
   */
  private getRoundMaxMessageId(round: CompletedConversationRound) {
    return Math.max(round.userMessage.id, round.assistantMessage.id);
  }

  /**
   * 确保会话摘要可用
   * @description 增量合并未摘要的旧轮次，并保留最近若干轮原始消息
   * @param conversation - 当前会话实体
   * @param completedRounds - 全部已完成轮次
   * @returns 最新摘要与仍需保留的最近轮次
   */
  private async ensureConversationMemory(
    conversation: Conversation,
    completedRounds: CompletedConversationRound[],
  ): Promise<ConversationMemoryState> {
    // 只把较早的轮次折叠进摘要里，最近若干轮仍保留原始消息供模型直接参考。
    const hasStoredMemory = Boolean(conversation.memorySummary?.trim());
    let memorySummary = hasStoredMemory
      ? conversation.memorySummary!.trim()
      : '';
    let summarizedUntilMessageId = hasStoredMemory
      ? conversation.summarizedUntilMessageId || 0
      : 0;
    let unsummarizedRounds = completedRounds.filter(
      (round) => this.getRoundMaxMessageId(round) > summarizedUntilMessageId,
    );

    if (unsummarizedRounds.length > RAW_HISTORY_RETENTION_ROUNDS) {
      const roundsToSummarize = unsummarizedRounds.slice(
        0,
        unsummarizedRounds.length - RAW_HISTORY_RETENTION_ROUNDS,
      );

      for (
        let startIndex = 0;
        startIndex < roundsToSummarize.length;
        startIndex += SUMMARY_BATCH_ROUNDS
      ) {
        const batchRounds = roundsToSummarize.slice(
          startIndex,
          startIndex + SUMMARY_BATCH_ROUNDS,
        );

        memorySummary = await this.mergeConversationMemory(
          memorySummary,
          batchRounds,
        );
        summarizedUntilMessageId = this.getRoundMaxMessageId(
          batchRounds[batchRounds.length - 1],
        );
        conversation.memorySummary = memorySummary;
        conversation.summarizedUntilMessageId = summarizedUntilMessageId;
        conversation.memoryUpdatedAt = new Date();
        await this.conversationRepo.save(conversation);
      }

      unsummarizedRounds = completedRounds.filter(
        (round) => this.getRoundMaxMessageId(round) > summarizedUntilMessageId,
      );
    }

    return {
      memorySummary,
      recentRounds: unsummarizedRounds,
    };
  }

  /**
   * 合并会话摘要
   * @description 把已有摘要与新增轮次发给摘要模型，生成新的完整摘要文档
   * @param memorySummary - 当前摘要内容
   * @param rounds - 新增待折叠轮次
   * @returns 更新后的摘要文本
   */
  private async mergeConversationMemory(
    memorySummary: string,
    rounds: CompletedConversationRound[],
  ) {
    const response = await this.summaryModel.invoke([
      new SystemMessage(CONVERSATION_SUMMARY_SYSTEM_PROMPT),
      new HumanMessage(
        this.buildConversationSummaryPrompt(memorySummary, rounds),
      ),
    ]);
    const nextSummary = this.extractChunkContent(response.content).trim();

    if (!nextSummary) {
      throw new Error('Summary model returned empty content');
    }

    return nextSummary;
  }

  /**
   * 构建摘要提示词
   * @description 组织旧摘要和新增轮次，供摘要模型生成新的完整文档
   * @param memorySummary - 当前摘要内容
   * @param rounds - 新增待折叠轮次
   * @returns 发给摘要模型的提示词
   */
  private buildConversationSummaryPrompt(
    memorySummary: string,
    rounds: CompletedConversationRound[],
  ) {
    return `请根据已有摘要与新增对话轮次，输出一份完整的更新后摘要文档。

## 旧摘要
${memorySummary || '- 无'}

## 新增对话轮次
${this.formatConversationRoundsForSummary(rounds)}`;
  }

  /**
   * 格式化轮次摘要输入
   * @description 将轮次列表转换为可读的文本块，便于摘要模型理解上下文
   * @param rounds - 已完成轮次列表
   * @returns 格式化后的轮次文本
   */
  private formatConversationRoundsForSummary(
    rounds: CompletedConversationRound[],
  ) {
    return rounds
      .map(
        (round, index) => `### 轮次 ${index + 1}
requestId: ${round.requestId}

用户：${this.getDisplayContent(round.userMessage)}

助手：${round.assistantMessage.content}`,
      )
      .join('\n\n');
  }

  /**
   * 在用户发言后更新会话元信息
   * @description 根据用户输入尝试生成标题，并刷新会话更新时间
   * @param conversation - 当前会话实体
   * @param content - 用户输入内容
   */
  private async updateConversationAfterUserMessage(
    conversation: Conversation,
    content: string,
  ) {
    const nextTitle = this.buildConversationTitle(content);

    if (
      nextTitle &&
      (!conversation.title ||
        DEFAULT_CONVERSATION_TITLES.includes(conversation.title))
    ) {
      conversation.title = nextTitle;
    }

    await this.touchConversation(conversation);
  }

  /**
   * 构建会话标题
   * @description 使用首轮用户输入生成简短标题，过长内容会被截断
   * @param content - 用户输入内容
   * @returns 生成后的标题
   */
  private buildConversationTitle(content: string) {
    const normalizedContent = content.replace(/\s+/g, ' ').trim();

    if (!normalizedContent) {
      return '';
    }

    if (normalizedContent.length <= 30) {
      return normalizedContent;
    }

    return `${normalizedContent.slice(0, 30)}...`;
  }

  /**
   * 刷新会话更新时间
   * @description 统一更新 updatedAt 并持久化会话
   * @param conversation - 当前会话实体
   */
  private async touchConversation(conversation: Conversation) {
    conversation.updatedAt = new Date();
    await this.conversationRepo.save(conversation);
  }

  /**
   * 判断消息是否应进入提示词历史
   * @description 过滤流式未完成的消息，避免把不完整内容送回模型
   * @param message - 待判断消息
   * @param currentUserMessageId - 当前用户消息 ID
   * @returns 是否应注入模型历史
   */
  private shouldIncludeInPromptHistory(
    message: ConversationRuntimeMessage,
    currentUserMessageId: number,
  ) {
    if (message.role === MessageRole.ASSISTANT) {
      return message.streamStatus === StreamStatus.COMPLETED;
    }

    if (message.role === MessageRole.USER) {
      return (
        message.streamStatus === StreamStatus.COMPLETED ||
        message.id === currentUserMessageId
      );
    }

    return true;
  }

  /**
   * 创建或复用用户消息
   * @description 支持 requestId 幂等写入，避免同一请求重复创建用户消息
   * @param conversation - 当前会话实体
   * @param history - 会话现有运行时消息
   * @param conversationId - 会话 ID
   * @param requestId - 请求 ID
   * @param content - 用户输入内容
   * @returns 当前轮对应的用户消息
   */
  private async createOrReuseUserMessage(
    conversation: Conversation,
    history: ConversationRuntimeMessage[],
    conversationId: number,
    requestId: string,
    content: string,
  ) {
    const existingUserMessage = this.findMessageByRequestId(
      history,
      requestId,
      MessageRole.USER,
    );

    if (existingUserMessage) {
      if (this.getDisplayContent(existingUserMessage) !== content) {
        throw new BadRequestException(
          'Request content does not match the existing requestId',
        );
      }

      if (existingUserMessage.streamStatus !== StreamStatus.PENDING) {
        const updatedUserMessage = await this.messageRepo.save({
          ...existingUserMessage,
          streamStatus: StreamStatus.PENDING,
        });
        const runtimeMessage = this.toRuntimeMessage(updatedUserMessage);
        this.conversationRuntimeMemoryService.upsertMessage(runtimeMessage);
        return runtimeMessage;
      }

      return existingUserMessage;
    }

    const savedUserMessage = await this.saveMessage(
      conversationId,
      content,
      MessageRole.USER,
      {
        requestId,
        streamStatus: StreamStatus.PENDING,
      },
    );
    const runtimeMessage = this.toRuntimeMessage(savedUserMessage);
    this.conversationRuntimeMemoryService.upsertMessage(runtimeMessage);
    await this.updateConversationAfterUserMessage(conversation, content);

    return runtimeMessage;
  }

  /**
   * 创建模型流式生成器
   * @description 负责消费模型流、写入助手消息、同步请求状态并处理异常中断
   * @param params - 流式生成所需参数
   * @returns 返回给控制器的字符串异步生成器
   */
  private createModelStreamGenerator(params: {
    conversation: Conversation;
    conversationId: number;
    requestId: string;
    stream: AsyncIterable<{ content: unknown }>;
    signal?: AbortSignal;
  }): AsyncGenerator<string> {
    const { conversation, conversationId, requestId, stream, signal } = params;
    const service = this;

    return (async function* generator() {
      let fullResponse = '';

      try {
        for await (const chunk of stream) {
          if (signal?.aborted) {
            await service.markRequestInterrupted(
              conversation,
              conversationId,
              requestId,
            );
            return;
          }

          const chunkContent = service.extractChunkContent(chunk.content);
          if (!chunkContent) {
            continue;
          }

          fullResponse += chunkContent;
          yield chunkContent;
        }

        if (signal?.aborted) {
          await service.markRequestInterrupted(
            conversation,
            conversationId,
            requestId,
          );
          return;
        }

        await service.saveCompletedAssistantMessage(
          conversationId,
          requestId,
          fullResponse,
        );
        await service.updateRequestStatus(
          conversationId,
          requestId,
          StreamStatus.COMPLETED,
        );
        await service.touchConversation(conversation);
      } catch (error) {
        if (signal?.aborted) {
          await service.markRequestInterrupted(
            conversation,
            conversationId,
            requestId,
          );
          return;
        }

        await service.updateRequestStatus(
          conversationId,
          requestId,
          StreamStatus.FAILED,
        );
        await service.touchConversation(conversation);
        throw error;
      }
    })();
  }

  /**
   * 创建回放生成器
   * @description 把已完成回复按固定分片重新输出，便于同 requestId 的重复请求快速回放
   * @param content - 已保存的完整助手回复
   * @returns 文本分片生成器
   */
  private async *createReplayGenerator(content: string) {
    if (!content) {
      return;
    }

    for (
      let startIndex = 0;
      startIndex < content.length;
      startIndex += REPLAY_CHUNK_SIZE
    ) {
      yield content.slice(startIndex, startIndex + REPLAY_CHUNK_SIZE);
    }
  }

  /**
   * 提取模型分片文本
   * @description 兼容字符串与数组块两种返回格式，统一提取可输出文本
   * @param content - 模型返回的分片内容
   * @returns 归一化后的文本内容
   */
  private extractChunkContent(content: unknown) {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }

        return '';
      })
      .join('');
  }

  /**
   * 标记请求已中断
   * @description 当客户端断开或主动取消时，把当前 requestId 的状态更新为中断
   * @param conversation - 当前会话实体
   * @param conversationId - 会话 ID
   * @param requestId - 请求 ID
   */
  private async markRequestInterrupted(
    conversation: Conversation,
    conversationId: number,
    requestId: string,
  ) {
    await this.updateRequestStatus(
      conversationId,
      requestId,
      StreamStatus.INTERRUPTED,
    );
    await this.touchConversation(conversation);
  }

  /**
   * 保存已完成的助手消息
   * @description 优先复用同 requestId 的助手消息，不存在时再新增消息记录
   * @param conversationId - 会话 ID
   * @param requestId - 请求 ID
   * @param content - 助手完整回复内容
   * @returns 已保存的助手消息
   */
  private async saveCompletedAssistantMessage(
    conversationId: number,
    requestId: string,
    content: string,
  ) {
    const history = await this.getConversationRuntimeMessages(conversationId);
    const existingAssistantMessage = this.findMessageByRequestId(
      history,
      requestId,
      MessageRole.ASSISTANT,
    );

    if (existingAssistantMessage?.streamStatus === StreamStatus.COMPLETED) {
      return existingAssistantMessage;
    }

    if (existingAssistantMessage) {
      const updatedAssistantMessage = await this.messageRepo.save({
        ...existingAssistantMessage,
        content,
        streamStatus: StreamStatus.COMPLETED,
      });
      const runtimeMessage = this.toRuntimeMessage(updatedAssistantMessage);
      this.conversationRuntimeMemoryService.upsertMessage(runtimeMessage);
      return runtimeMessage;
    }

    const savedAssistantMessage = await this.saveMessage(
      conversationId,
      content,
      MessageRole.ASSISTANT,
      {
        requestId,
        streamStatus: StreamStatus.COMPLETED,
      },
    );
    const runtimeMessage = this.toRuntimeMessage(savedAssistantMessage);
    this.conversationRuntimeMemoryService.upsertMessage(runtimeMessage);

    return runtimeMessage;
  }

  /**
   * 更新请求状态
   * @description 同步更新数据库和运行时缓存中同一 requestId 的用户/助手消息状态
   * @param conversationId - 会话 ID
   * @param requestId - 请求 ID
   * @param status - 最新流式状态
   */
  private async updateRequestStatus(
    conversationId: number,
    requestId: string,
    status: StreamStatus,
  ) {
    await Promise.all([
      this.messageRepo.update(
        {
          conversationId,
          requestId,
          role: MessageRole.USER,
        },
        {
          streamStatus: status,
        },
      ),
      this.messageRepo.update(
        {
          conversationId,
          requestId,
          role: MessageRole.ASSISTANT,
        },
        {
          streamStatus: status,
        },
      ),
    ]);

    this.conversationRuntimeMemoryService.updateRequestStatus(
      conversationId,
      requestId,
      status,
    );
  }

  /**
   * 按 requestId 查找消息
   * @description 在运行时历史中定位某个角色对应的指定请求消息
   * @param history - 会话运行时消息列表
   * @param requestId - 请求 ID
   * @param role - 目标消息角色
   * @returns 匹配到的消息；不存在时返回 undefined
   */
  private findMessageByRequestId(
    history: ConversationRuntimeMessage[],
    requestId: string,
    role: MessageRole,
  ) {
    return history.find(
      (message) => message.requestId === requestId && message.role === role,
    );
  }

  /**
   * 保存消息
   * @description 创建并持久化一条消息实体，默认状态为已完成
   * @param conversationId - 会话 ID
   * @param content - 消息内容
   * @param role - 消息角色
   * @param options - 额外保存选项
   * @returns 持久化后的消息实体
   */
  private async saveMessage(
    conversationId: number,
    content: string,
    role: MessageRole,
    options: SaveMessageOptions = {},
  ) {
    const message = this.messageRepo.create({
      conversationId,
      content,
      role,
      requestId: options.requestId ?? null,
      streamStatus: options.streamStatus ?? StreamStatus.COMPLETED,
    });
    return this.messageRepo.save(message);
  }

  /**
   * 转换为运行时消息
   * @description 统一把数据库实体转换成运行时缓存使用的轻量消息结构
   * @param message - 数据库实体或运行时消息
   * @returns 运行时消息对象
   */
  private toRuntimeMessage(message: ConversationRuntimeMessage | Message) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      requestId: message.requestId ?? null,
      streamStatus: message.streamStatus ?? StreamStatus.COMPLETED,
      content: message.content,
      createdAt: new Date(message.createdAt),
    };
  }
}
