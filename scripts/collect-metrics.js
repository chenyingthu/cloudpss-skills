#!/usr/bin/env node

/**
 * 多智能体实验数据收集器
 *
 * 自动化采集和记录实验过程中的关键指标
 */

const fs = require('fs');
const path = require('path');

class MetricsCollector {
  constructor(options = {}) {
    this.config = {
      outputPath: options.outputPath || './experiment-data',
      sessionId: options.sessionId || this.generateSessionId(),
      mode: options.mode || 'unknown'
    };

    this.events = [];
    this.tools = new Map();
    this.startTime = Date.now();
    this.tasks = new Map();
    this.metrics = {
      efficiency: {
        startTime: this.startTime,
        endTime: null,
        toolCalls: 0,
        parallelExecutions: 0
      },
      quality: {
        codeReviews: [],
        testResults: [],
        bugReports: []
      },
      collaboration: {
        agentMessages: 0,
        conflicts: [],
        knowledgeShares: 0
      }
    };

    this.ensureOutputDir();
  }

  generateSessionId() {
    const now = new Date();
    return `session-${now.toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.config.outputPath)) {
      fs.mkdirSync(this.config.outputPath, { recursive: true });
    }
  }

  // ============ 事件记录 ============

  recordEvent(type, data = {}) {
    const event = {
      offset_ms: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
      type,
      ...data
    };

    this.events.push(event);
    this.autoSave();

    return event;
  }

  // 任务相关事件
  recordTaskCreate(taskId, subject, mode = 'multi-agent') {
    this.tasks.set(taskId, {
      subject,
      mode,
      createdAt: Date.now(),
      completedAt: null,
      status: 'pending'
    });

    return this.recordEvent('task_create', {
      taskId,
      subject,
      mode,
      agent: 'orchestrator'
    });
  }

  recordTaskComplete(taskId, status = 'completed') {
    const task = this.tasks.get(taskId);
    if (task) {
      task.completedAt = Date.now();
      task.status = status;
      this.tasks.set(taskId, task);
    }

    return this.recordEvent('task_complete', {
      taskId,
      status,
      duration_ms: task ? task.completedAt - task.createdAt : 0
    });
  }

  // 工具调用事件
  recordToolCall(toolName, duration_ms, success = true) {
    this.metrics.efficiency.toolCalls++;

    if (!this.tools.has(toolName)) {
      this.tools.set(toolName, { calls: 0, totalDuration: 0, successes: 0 });
    }

    const toolStats = this.tools.get(toolName);
    toolStats.calls++;
    toolStats.totalDuration += duration_ms;
    if (success) toolStats.successes++;
    this.tools.set(toolName, toolStats);

    return this.recordEvent('tool_call', {
      toolName,
      duration_ms,
      success
    });
  }

  // Agent 通信事件
  recordAgentMessage(fromAgent, toAgent, messageType) {
    this.metrics.collaboration.agentMessages++;

    return this.recordEvent('agent_message', {
      fromAgent,
      toAgent,
      messageType
    });
  }

  // 冲突事件
  recordConflictDetected(description, agents) {
    const conflict = {
      id: `conflict-${this.metrics.collaboration.conflicts.length + 1}`,
      detected_at: Date.now(),
      resolved_at: null,
      description,
      agents
    };

    this.metrics.collaboration.conflicts.push(conflict);

    return this.recordEvent('conflict_detected', {
      conflictId: conflict.id,
      description,
      agents
    });
  }

  recordConflictResolved(conflictId, resolution) {
    const conflict = this.metrics.collaboration.conflicts.find(c => c.id === conflictId);
    if (conflict) {
      conflict.resolved_at = Date.now();
      conflict.resolution = resolution;
    }

    return this.recordEvent('conflict_resolved', {
      conflictId,
      resolution,
      duration_ms: conflict ? conflict.resolved_at - conflict.detected_at : 0
    });
  }

  // 知识共享事件
  recordKnowledgeShare(knowledgeType, fromAgent, toAgents) {
    this.metrics.collaboration.knowledgeShares++;

    return this.recordEvent('knowledge_share', {
      knowledgeType,
      fromAgent,
      toAgents
    });
  }

  // 质量相关事件
  recordCodeReview(score, reviewer, comments = []) {
    this.metrics.quality.codeReviews.push({
      score,
      reviewer,
      comments,
      timestamp: Date.now()
    });

    return this.recordEvent('code_review', {
      score,
      reviewer,
      comment_count: comments.length
    });
  }

  recordTestResult(passRate, testCount, failedTests = []) {
    this.metrics.quality.testResults.push({
      passRate,
      testCount,
      failedTests,
      timestamp: Date.now()
    });

    return this.recordEvent('test_result', {
      passRate,
      testCount,
      failed_count: failedTests.length
    });
  }

  // ============ 数据导出 ============

  getSessionMetrics() {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    return {
      experiment: 'multi-agent-validation',
      session_id: this.config.sessionId,
      mode: this.config.mode,
      timestamp: {
        start: new Date(this.startTime).toISOString(),
        end: new Date(endTime).toISOString(),
        duration_ms: duration
      },
      metrics: {
        efficiency: {
          duration_seconds: duration / 1000,
          tool_calls: this.metrics.efficiency.toolCalls,
          tools_breakdown: Array.from(this.tools.entries()).map(([name, stats]) => ({
            name,
            call_count: stats.calls,
            avg_duration_ms: Math.round(stats.totalDuration / stats.calls),
            success_rate: stats.calls > 0 ? stats.successes / stats.calls : 0
          })),
          tasks_created: this.tasks.size,
          tasks_completed: Array.from(this.tasks.values()).filter(t => t.status === 'completed').length
        },
        quality: {
          code_review_count: this.metrics.quality.codeReviews.length,
          avg_code_review_score: this.metrics.quality.codeReviews.length > 0
            ? this.metrics.quality.codeReviews.reduce((sum, r) => sum + r.score, 0) / this.metrics.quality.codeReviews.length
            : 0,
          test_result_count: this.metrics.quality.testResults.length,
          avg_test_pass_rate: this.metrics.quality.testResults.length > 0
            ? this.metrics.quality.testResults.reduce((sum, r) => sum + r.passRate, 0) / this.metrics.quality.testResults.length
            : 0
        },
        collaboration: {
          agent_message_count: this.metrics.collaboration.agentMessages,
          conflict_count: this.metrics.collaboration.conflicts.length,
          conflicts_resolved: this.metrics.collaboration.conflicts.filter(c => c.resolved_at).length,
          avg_conflict_resolution_time_ms: this.metrics.collaboration.conflicts.filter(c => c.resolved_at).length > 0
            ? this.metrics.collaboration.conflicts
                .filter(c => c.resolved_at)
                .reduce((sum, c) => sum + (c.resolved_at - c.detected_at), 0)
                / this.metrics.collaboration.conflicts.filter(c => c.resolved_at).length
            : 0,
          knowledge_share_count: this.metrics.collaboration.knowledgeShares
        }
      },
      events: this.events,
      tasks: Array.from(this.tasks.entries()).map(([id, task]) => ({
        id,
        subject: task.subject,
        mode: task.mode,
        status: task.status,
        duration_ms: task.completedAt ? task.completedAt - task.createdAt : null
      }))
    };
  }

  autoSave() {
    // 每 10 个事件自动保存一次
    if (this.events.length % 10 === 0) {
      this.saveReport();
    }
  }

  saveReport() {
    const metrics = this.getSessionMetrics();
    const filename = path.join(
      this.config.outputPath,
      `metrics-${this.config.sessionId}.json`
    );

    fs.writeFileSync(filename, JSON.stringify(metrics, null, 2));
    console.log(`[MetricsCollector] Report saved: ${filename}`);

    return filename;
  }

  generateSummary() {
    const metrics = this.getSessionMetrics();

    console.log('\n' + '='.repeat(60));
    console.log('多智能体实验数据收集摘要');
    console.log('='.repeat(60));
    console.log(`会话 ID: ${metrics.session_id}`);
    console.log(`模式：${metrics.mode}`);
    console.log(`持续时间：${Math.round(metrics.metrics.efficiency.duration_seconds)}秒`);
    console.log('');
    console.log('效率指标:');
    console.log(`  工具调用：${metrics.metrics.efficiency.tool_calls}`);
    console.log(`  任务创建：${metrics.metrics.efficiency.tasks_created}`);
    console.log(`  任务完成：${metrics.metrics.efficiency.tasks_completed}`);
    console.log('');
    console.log('质量指标:');
    console.log(`  代码审查：${metrics.metrics.quality.code_review_count} (平均：${metrics.metrics.quality.avg_code_review_score.toFixed(1)}/5)`);
    console.log(`  测试通过率：${(metrics.metrics.quality.avg_test_pass_rate * 100).toFixed(1)}%`);
    console.log('');
    console.log('协作指标:');
    console.log(`  Agent 消息：${metrics.metrics.collaboration.agent_message_count}`);
    console.log(`  冲突数量：${metrics.metrics.collaboration.conflict_count}`);
    console.log(`  知识共享：${metrics.metrics.collaboration.knowledge_share_count}`);
    console.log('='.repeat(60) + '\n');

    return metrics;
  }
}

// 导出供其他模块使用
module.exports = { MetricsCollector };

// CLI 模式
if (require.main === module) {
  const collector = new MetricsCollector({
    mode: process.argv[2] || 'multi-agent'
  });

  console.log(`[MetricsCollector] Started in ${collector.config.mode} mode`);
  console.log(`Session ID: ${collector.config.sessionId}`);
  console.log(`Output: ${collector.config.outputPath}`);

  // 示例：记录一些测试事件
  collector.recordTaskCreate('task-1', 'Design architecture');
  collector.recordTaskCreate('task-2', 'Implement module');
  collector.recordToolCall('Read', 150);
  collector.recordToolCall('Edit', 320);
  collector.recordAgentMessage('orchestrator', 'engineer', 'task_assignment');

  // 生成摘要
  setTimeout(() => {
    collector.generateSummary();
    collector.saveReport();
    console.log('[MetricsCollector] Demo completed');
  }, 1000);
}
