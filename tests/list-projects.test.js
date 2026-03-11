#!/usr/bin/env node
/**
 * 测试 listProjects 功能
 *
 * 验证 CloudPSS 官方 Model.fetchMany() API 的集成
 */

const path = require('path');
const fs = require('fs');
const CloudPSSClient = require('../src/api/client');

// 加载 CloudPSS Token
const tokenPath = path.join(__dirname, '../../.cloudpss_token');
if (fs.existsSync(tokenPath)) {
  const token = fs.readFileSync(tokenPath, 'utf-8').trim();
  process.env.CLOUDPSS_TOKEN = token;
  console.log('[CloudPSS] Token 已从 .cloudpss_token 加载');
} else {
  console.error('[CloudPSS] 错误：未找到 .cloudpss_token 文件');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(60));
  console.log('测试 listProjects 功能');
  console.log('='.repeat(60));

  const client = new CloudPSSClient();

  try {
    // 测试 1: 获取当前用户的项目列表
    console.log('\n📋 测试 1: 获取当前用户的项目列表');
    const myProjects = await client.listProjects();
    console.log(`   找到 ${myProjects.length} 个项目`);

    if (myProjects.length > 0) {
      console.log('\n   项目列表 (前 5 个):');
      myProjects.slice(0, 5).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name || '未命名'}`);
        console.log(`      RID: ${p.rid}`);
        console.log(`      描述: ${p.description || '无描述'}`);
        console.log(`      更新时间: ${p.updatedAt || '未知'}`);
      });

      // 保存第一个项目的 rid 用于后续测试
      const firstProjectRid = myProjects[0].rid;
      console.log(`\n   将使用第一个项目进行后续测试: ${firstProjectRid}`);
    }

    // 测试 2: 按名称搜索项目
    console.log('\n📋 测试 2: 按名称搜索项目');
    const searchResults = await client.listProjects({ name: 'IEEE' });
    console.log(`   搜索 "IEEE" 找到 ${searchResults.length} 个项目`);

    if (searchResults.length > 0) {
      searchResults.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} (${p.rid})`);
      });
    }

    // 测试 3: 获取所有公开项目
    console.log('\n📋 测试 3: 获取所有公开项目 (owner="*")');
    const publicProjects = await client.listProjects({ owner: '*', pageSize: 10 });
    console.log(`   找到 ${publicProjects.length} 个公开项目 (限制 10 个)`);

    if (publicProjects.length > 0) {
      publicProjects.slice(0, 5).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} (${p.rid})`);
      });
    }

    console.log('\n✅ 所有测试通过!');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();