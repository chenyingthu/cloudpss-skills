/**
 * Component Analysis Skill Tests
 *
 * 测试元件分析功能的正确性
 */

const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// 导入被测试的模块
const ComponentAnalysisSkill = require('../src/skills/analyze-component');

// 模拟客户端
class MockClient {
  constructor() {
    // 加载测试数据
    const dataPath = path.join(__dirname, '../experiment-data/ieee3-full-structure.json');
    this.testData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  }

  async getAllComponents() {
    const components = {};
    for (const [type, comps] of Object.entries(this.testData.components_by_type)) {
      for (const comp of comps) {
        components[comp.id] = {
          id: comp.id,
          label: comp.label,
          definition: comp.definition,
          args: comp.args,
          pins: {}
        };
      }
    }
    return components;
  }
}

describe('ComponentAnalysisSkill', async () => {
  let skill;
  let mockClient;

  before(() => {
    mockClient = new MockClient();
    skill = new ComponentAnalysisSkill(mockClient);
  });

  describe('classifyComponents', () => {
    it('应该正确分类所有元件', () => {
      const components = [
        { id: '1', definition: 'model/CloudPSS/SyncGeneratorRouter', args: {} },
        { id: '2', definition: 'model/CloudPSS/TransmissionLine', args: {} },
        { id: '3', definition: 'model/CloudPSS/_newExpLoad_3p', args: {} },
        { id: '4', definition: 'model/CloudPSS/_newBus_3p', args: {} },
        { id: '5', definition: 'model/CloudPSS/_newTransformer_3p2w', args: {} },
        { id: '6', definition: null, args: {} }
      ];

      const classified = skill.classifyComponents(components);

      assert.strictEqual(classified.generator?.length, 1);
      assert.strictEqual(classified.line?.length, 1);
      assert.strictEqual(classified.load?.length, 1);
      assert.strictEqual(classified.bus?.length, 1);
      assert.strictEqual(classified.transformer?.length, 1);
      assert.strictEqual(classified.unknown?.length, 1);
    });

    it('应该处理空数组', () => {
      const classified = skill.classifyComponents([]);
      assert.strictEqual(Object.keys(classified).length, 0);
    });
  });

  describe('_getComponentType', () => {
    it('应该识别发电机类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/SyncGeneratorRouter'), 'generator');
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_newGen'), 'generator');
    });

    it('应该识别线路类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/TransmissionLine'), 'line');
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_newLine_3p'), 'line');
    });

    it('应该识别负荷类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_newExpLoad_3p'), 'load');
    });

    it('应该识别变压器类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_newTransformer_3p2w'), 'transformer');
    });

    it('应该识别母线类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_newBus_3p'), 'bus');
    });

    it('应该识别故障类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_newFaultResistor_3p'), 'fault');
    });

    it('应该识别调速器类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_STEAM_GOV_1'), 'turbine_governor');
    });

    it('应该识别励磁系统类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_EXST1_PTI'), 'exciter');
    });

    it('应该识别 PSS 类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_PSS1A'), 'pss');
    });

    it('应该识别测量类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_NewVoltageMeter'), 'measurement');
    });

    it('应该识别控制类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_newGain'), 'control');
      assert.strictEqual(skill._getComponentType('model/CloudPSS/_newChannel'), 'control');
    });

    it('应该识别标签类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/ElectricalLable'), 'label');
    });

    it('应该识别接地类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/GND'), 'ground');
    });

    it('应该返回 unknown 对于 null 定义', () => {
      assert.strictEqual(skill._getComponentType(null), 'unknown');
      assert.strictEqual(skill._getComponentType(undefined), 'unknown');
    });

    it('应该返回 unknown 对于未识别的类型', () => {
      assert.strictEqual(skill._getComponentType('model/CloudPSS/UnknownType'), 'unknown');
    });
  });

  describe('analyzeComponents', async () => {
    it('应该返回完整的元件分析报告', async () => {
      const result = await skill.analyzeComponents('model/CloudPSS/IEEE3');

      assert(result.rid);
      assert(result.timestamp);
      assert(result.statistics);
      assert(result.summary);
      assert.strictEqual(result.rid, 'model/CloudPSS/IEEE3');
    });

    it('应该统计正确的元件总数', async () => {
      const result = await skill.analyzeComponents('model/CloudPSS/IEEE3');

      assert(result.summary.total_components > 0);
      assert(result.statistics.total > 0);
    });

    it('应该包含所有分类类别', async () => {
      const result = await skill.analyzeComponents('model/CloudPSS/IEEE3');

      const categories = result.summary.categories.map(c => c.name);
      assert(categories.includes('bus'));
      assert(categories.includes('transformer'));
      assert(categories.includes('turbine_governor'));
      assert(categories.includes('label'));
    });
  });

  describe('getComponentBy', async () => {
    it('应该根据 ID 查询元件', async () => {
      // 获取所有组件找到一个有效的 ID
      const allComponents = await mockClient.getAllComponents();
      const firstId = Object.keys(allComponents)[0];

      const result = await skill.getComponentBy('model/CloudPSS/IEEE3', { id: firstId });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, firstId);
    });

    it('应该根据 label 查询元件', async () => {
      const result = await skill.getComponentBy('model/CloudPSS/IEEE3', { label: 'NC-6' });
      assert(result.length > 0);
      assert.strictEqual(result[0].label, 'NC-6');
    });

    it('应该根据 type 查询元件', async () => {
      const result = await skill.getComponentBy('model/CloudPSS/IEEE3', { type: 'bus' });
      assert(result.length > 0);
      // 所有返回的元件都应该是 bus 类型
      for (const comp of result) {
        const compType = skill._getComponentType(comp.definition);
        assert.strictEqual(compType, 'bus');
      }
    });

    it('应该根据 definition 查询元件', async () => {
      const def = 'model/CloudPSS/_newBus_3p';
      const result = await skill.getComponentBy('model/CloudPSS/IEEE3', { definition: def });
      assert(result.length > 0);
      for (const comp of result) {
        assert.strictEqual(comp.definition, def);
      }
    });
  });

  describe('getComponentParameters', async () => {
    it('应该返回元件参数', async () => {
      const allComponents = await mockClient.getAllComponents();
      const firstId = Object.keys(allComponents)[0];

      const result = await skill.getComponentParameters('model/CloudPSS/IEEE3', firstId);

      assert(result.id);
      assert(result.label);
      assert(result.definition);
      assert(result.type);
      assert(result.parameters);
      assert('parameterCount' in result);
    });

    it('应该返回错误对于不存在的元件', async () => {
      const result = await skill.getComponentParameters('model/CloudPSS/IEEE3', 'non-existent-id');

      assert(result.error);
      assert.strictEqual(result.error, '元件不存在');
    });
  });

  describe('_generateSummary', () => {
    it('应该生成正确的摘要', () => {
      const classified = {
        bus: [{}, {}, {}],
        line: [{}, {}],
        unknown: [{}]
      };

      const summary = skill._generateSummary(classified);

      assert.strictEqual(summary.total_components, 6);
      assert.strictEqual(summary.categories.length, 3);
      assert.strictEqual(summary.categories[0].name, 'bus');
      assert.strictEqual(summary.categories[0].count, 3);
    });

    it('百分比计算应该正确', () => {
      const classified = {
        bus: [{}, {}, {}, {}], // 4 = 50%
        line: [{}, {}, {}, {}], // 4 = 50%
      };

      const summary = skill._generateSummary(classified);

      const busCat = summary.categories.find(c => c.name === 'bus');
      assert.strictEqual(busCat.percentage, 50);
    });
  });

  describe('_calculateParameterStatistics', () => {
    it('应该计算参数统计', () => {
      const components = [
        { args: { a: 1, b: 2 } },
        { args: { a: 1, b: 2, c: 3 } },
        { args: { a: 1 } }
      ];

      const stats = skill._calculateParameterStatistics(components);

      assert.strictEqual(stats.minParams, 1);
      assert.strictEqual(stats.maxParams, 3);
      assert.strictEqual(stats.avgParams, 2);
    });

    it('应该处理空参数', () => {
      const components = [
        { args: {} },
        { args: null },
        { args: { a: 1 } }
      ];

      const stats = skill._calculateParameterStatistics(components);

      assert.strictEqual(stats.minParams, 0);
    });
  });
});

// 集成测试 - 使用实际数据文件
describe('Component Analysis Integration Tests', () => {
  it('应该能分析 IEEE3 完整数据', () => {
    const dataPath = path.join(__dirname, '../experiment-data/ieee3-full-structure.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    const skill = new ComponentAnalysisSkill({});

    // 合并所有组件
    const allComponents = [];
    for (const comps of Object.values(data.components_by_type)) {
      allComponents.push(...comps);
    }

    const classified = skill.classifyComponents(allComponents);

    // 验证分类结果
    assert.strictEqual(classified.bus.length, 9);
    assert.strictEqual(classified.label.length, 6);
    assert.strictEqual(classified.transformer.length, 3);
    assert.strictEqual(classified.turbine_governor.length, 6);

    // IEEE3 应该有发电机、线路、负荷等
    assert(classified.generator);
    assert(classified.line);
    assert(classified.load);
  });

  it('应该统计 other 类别中的元件类型', () => {
    const dataPath = path.join(__dirname, '../experiment-data/ieee3-full-structure.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    const skill = new ComponentAnalysisSkill({});
    const otherComponents = data.components_by_type.other;
    const classified = skill.classifyComponents(otherComponents);

    // other 类别中应该包含多种类型
    const totalClassified = Object.values(classified).reduce((sum, arr) => sum + arr.length, 0);
    assert.strictEqual(totalClassified, otherComponents.length);

    // 应该能识别出线路、发电机、负荷等
    assert((classified.line?.length || 0) > 0);
    assert((classified.generator?.length || 0) > 0);
    assert((classified.load?.length || 0) > 0);
  });
});
