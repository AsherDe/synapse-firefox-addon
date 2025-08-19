# Synapse 项目 Claude 记忆文档

## 🚨 重要约束和限制

### **绝对禁止 ES6 模块语法**
- **❌ 禁止使用:** `import` / `export` 语句
- **❌ 禁止使用:** `import()` 动态导入
- **✅ 必须使用:** `/// <reference path="./types.ts" />` 引用类型
- **✅ 必须使用:** 内联代码或全局函数/类

**原因:** 浏览器扩展的 content script 和 background script 不支持 ES6 模块，会导致 `ReferenceError: exports is not defined` 错误。

### TypeScript 配置要求
```json
{
  "module": "none",  // 关键配置
  "target": "ES2020",
  "isolatedModules": false
}
```

## 📁 项目结构

### 核心文件
- `src/content.ts` - Content script (用户交互事件捕获)
- `src/background-combined.ts` - Background script (事件处理和ML)
- `src/popup.ts` - 扩展弹窗界面
- `src/smart-assistant.ts` - 智能引导功能
- `src/types.ts` - 共享类型定义

### 编译流程
1. `npm run build` = `tsc && node build.js && web-ext build`
2. TypeScript 编译到 `dist/` 目录
3. `build.js` 重命名 background-combined.js → background.js
4. `web-ext build` 打包扩展

## 🎯 核心功能

### 1. 事件收集系统
收集14种用户行为事件：
- **用户交互:** click, keydown, text_input, scroll, mouse_pattern, form_submit, focus_change, page_visibility, mouse_hover, clipboard
- **浏览器行为:** tab_created, tab_activated, tab_updated, tab_removed

### 2. 智能引导系统 (v1.3.0)
三种UI模式：
- **高置信度 (>90%)**: 一键执行按钮，自动反馈收集
- **中置信度 (>70%)**: 微妙视觉提示 (光晕/图标)
- **自动填充**: 非敏感数据的一键填充建议

### 3. 数据导出和分析
- DevMode 导出包含所有事件类型的完整数据
- `scripts/clean_debug_data.py` 清洗和统计分析
- 支持 CSV, JSON, Parquet 格式

## 🔧 常见问题及解决方案

### 1. "exports is not defined" 错误
- **原因:** 使用了 import/export 语句
- **解决:** 移除所有 import，内联必要代码
- **检查:** 搜索 `import ` 和 `export ` 关键词

### 2. 只收集到浏览器事件，无用户交互事件
- **原因:** 扩展被暂停 (`isPaused = true`)
- **解决:** 点击扩展图标，点击 "Resume" 按钮
- **诊断:** 运行 `debug-synapse.js` 脚本

### 3. Content Script 加载失败
- **检查:** manifest.json 中的 content_scripts 配置
- **检查:** 编译后的 dist/content.js 是否存在语法错误
- **调试:** 浏览器开发者工具查看 Console 错误

## 📊 数据流架构

```
用户操作 → Content Script → Background Script → IndexedDB
                ↓
              事件处理 → ML分析 → 预测生成
                ↓
           智能建议 → Smart Assistant → 用户反馈
```

## 🎨 代码风格指南

### 事件处理模式
```typescript
document.addEventListener('click', (event: MouseEvent) => {
  const element = event.target as HTMLElement;
  
  const message: RawUserAction = {
    type: 'user_action_click',
    payload: {
      selector: getCssSelector(element),
      x: event.clientX,
      y: event.clientY,
      url: window.location.href,
      features: extractElementFeatures(element, url)
    }
  };

  chrome.runtime.sendMessage(message);
});
```

### 类型安全
- 所有事件必须符合 `EnrichedEvent` 联合类型
- 使用 `/// <reference path="./types.ts" />` 引用类型
- 避免 `any` 类型，优先使用具体接口

## 🔒 隐私和安全

### 数据收集原则
- 不收集密码字段 (`is_password_field` 检查)
- URL泛化保护隐私 (domain_hash, path分析)
- 文本输入只记录长度，不记录内容
- 自动填充仅限非敏感数据 (`isPrivacySafe` 标记)

### 存储策略
- 会话数据: `chrome.storage.session`
- 持久配置: `chrome.storage.local`
- ML模型: IndexedDB
- 批量写入优化性能

## 🚀 部署检查清单

1. ✅ 确认无 import/export 语句
2. ✅ TypeScript 编译无错误
3. ✅ 扩展未暂停状态
4. ✅ Content script 正确注入
5. ✅ 事件监听器正常工作
6. ✅ 数据正确存储到 IndexedDB
7. ✅ Smart Assistant 功能可用

## 📝 版本历史

- **v1.3.0**: 智能引导系统，增强反馈收集
- **v1.2.0**: URL泛化系统，ML模型优化
- **v1.1.0**: 行为引导系统基础版本
- **v1.0.0**: 基础事件收集和ML预测

---

**⚠️ 记住: 任何时候添加新功能都要避免使用 ES6 模块语法！**