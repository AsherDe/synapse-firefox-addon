# Synapse 数据收集完整测试流程

## 🚀 测试前准备

### 1. 扩展状态检查
- [ ] 在Firefox扩展管理页面重新加载Synapse扩展
- [ ] 点击Synapse扩展图标，确认显示"Pause"按钮（表示未暂停）
- [ ] 打开开发者工具(F12)，清空Console日志

### 2. 清空之前的数据
- [ ] 在扩展弹窗中点击"Clear"按钮清空之前的数据
- [ ] 或者在DevMode中导出当前数据作为baseline

## 📊 完整测试流程 (14种事件类型)

### 阶段1: 基础交互事件 (5种)

#### 1.1 点击事件 (user_action_click) ✅
- [ ] 打开 https://www.google.com
- [ ] 点击搜索框
- [ ] 点击"Google 搜索"按钮
- [ ] 点击页面上的链接
- [ ] 右键点击页面任意位置

#### 1.2 键盘事件 (user_action_keydown) ✅
- [ ] 在搜索框中按下 Ctrl+A (全选)
- [ ] 按下 Escape 键
- [ ] 按下 F5 刷新页面
- [ ] 按下 Tab 键切换焦点

#### 1.3 文本输入事件 (user_action_text_input) ✅
- [ ] 在Google搜索框中输入"测试查询"
- [ ] 删除部分文字
- [ ] 再次输入新的内容

#### 1.4 滚动事件 (user_action_scroll) 🔄
- [ ] 向下缓慢滚动页面 (至少50像素)
- [ ] 向上滚动页面
- [ ] 改变滚动方向多次
- [ ] 如果页面太短，打开一个长页面如Wikipedia文章

#### 1.5 鼠标移动模式 (user_action_mouse_pattern) 🔄
- [ ] 在页面上画圆圈 (至少3-4圈)
- [ ] 画zigzag锯齿状移动
- [ ] 快速移动鼠标然后停止
- [ ] 缓慢直线移动鼠标

### 阶段2: 高级交互事件 (5种)

#### 2.1 表单提交事件 (user_action_form_submit)
- [ ] 访问 https://httpbin.org/forms/post
- [ ] 填写表单字段
- [ ] 点击"Submit"按钮提交表单

#### 2.2 焦点变化事件 (user_action_focus_change)
- [ ] 在有多个输入框的页面上点击不同输入框
- [ ] 使用Tab键在表单字段间切换
- [ ] 点击页面其他区域使输入框失去焦点

#### 2.3 页面可见性事件 (user_action_page_visibility)
- [ ] 最小化浏览器窗口
- [ ] 恢复浏览器窗口
- [ ] 切换到其他应用程序
- [ ] 再次返回浏览器

#### 2.4 鼠标悬停事件 (user_action_mouse_hover)
- [ ] 将鼠标悬停在链接上 (停留2秒以上)
- [ ] 悬停在按钮上
- [ ] 悬停在图片上
- [ ] 移开鼠标

#### 2.5 剪贴板事件 (user_action_clipboard)
- [ ] 选择页面上的一段文字
- [ ] 按 Ctrl+C 复制
- [ ] 在输入框中按 Ctrl+V 粘贴
- [ ] 选择文字后按 Ctrl+X 剪切

### 阶段3: 浏览器级别事件 (4种)

#### 3.1 标签页创建 (browser_action_tab_created) ✅
- [ ] 按 Ctrl+T 新建标签页
- [ ] 右键点击链接选择"在新标签页中打开"
- [ ] 中键点击链接(滚轮点击)

#### 3.2 标签页激活 (browser_action_tab_activated) ✅
- [ ] 在多个标签页间切换
- [ ] 使用 Ctrl+Tab 快捷键切换
- [ ] 点击不同的标签页

#### 3.3 标签页更新 (browser_action_tab_updated) ✅
- [ ] 在地址栏输入新的URL并回车
- [ ] 点击页面内的链接导航到新页面
- [ ] 按 F5 刷新页面

#### 3.4 标签页关闭 (browser_action_tab_removed)
- [ ] 点击标签页的关闭按钮(X)
- [ ] 按 Ctrl+W 关闭当前标签页
- [ ] 右键标签页选择"关闭标签页"

## 🔍 测试过程监控

### 实时监控方法
在测试过程中，可以通过以下方式监控事件收集：

#### 方法1: 开发者工具监控
```javascript
// 在浏览器控制台运行此代码来监控事件发送
const originalSendMessage = chrome.runtime.sendMessage;
chrome.runtime.sendMessage = function(message, ...args) {
    if (message && message.type && message.type.startsWith('user_action_')) {
        console.log('🟢 Event sent:', message.type, message);
    }
    return originalSendMessage.call(this, message, ...args);
};
```

#### 方法2: 扩展弹窗监控
- [ ] 在测试过程中定期打开扩展弹窗
- [ ] 观察事件计数是否增加
- [ ] 查看最近事件列表

## 📈 数据验证检查

### 完成测试后的验证步骤

#### 1. 导出完整数据
- [ ] 打开扩展弹窗，点击"DevMode"
- [ ] 点击"Export Data"导出测试数据
- [ ] 保存为 `test-complete-YYYY-MM-DD.json`

#### 2. 数据完整性验证
检查导出的JSON中 `eventTypeDistribution` 是否包含：

```json
{
  "eventTypeDistribution": {
    "user_action_click": "应该 > 5",
    "user_action_keydown": "应该 > 3", 
    "user_action_text_input": "应该 > 2",
    "user_action_scroll": "应该 > 2",
    "user_action_mouse_pattern": "应该 > 1",
    "user_action_form_submit": "应该 >= 1",
    "user_action_focus_change": "应该 > 3",
    "user_action_page_visibility": "应该 > 2",
    "user_action_mouse_hover": "应该 > 3",
    "user_action_clipboard": "应该 > 3",
    "browser_action_tab_created": "应该 > 2",
    "browser_action_tab_activated": "应该 > 3",
    "browser_action_tab_updated": "应该 > 3",
    "browser_action_tab_removed": "应该 > 1"
  }
}
```

#### 3. 使用数据清洗脚本验证
```bash
cd "/Users/asherji/Source Code/Synapse"
python scripts/clean_debug_data.py test-complete-YYYY-MM-DD.json --stats test-stats.json
```

查看 `test-stats.json` 中的详细统计信息。

## 🐛 问题排查

### 如果某些事件类型未收集到：

#### 滚动事件问题
- [ ] 确保页面足够长可以滚动
- [ ] 尝试更大幅度的滚动动作
- [ ] 检查是否在可滚动的iframe中

#### 鼠标模式事件问题  
- [ ] 画更复杂的鼠标轨迹
- [ ] 确保鼠标移动后有短暂停顿
- [ ] 尝试不同的移动速度

#### 表单提交问题
- [ ] 确保使用的是真实的表单元素
- [ ] 尝试不同的网站表单
- [ ] 检查表单是否使用AJAX提交

#### 剪贴板事件问题
- [ ] 确保浏览器有剪贴板权限
- [ ] 尝试不同的复制粘贴操作
- [ ] 检查是否在安全上下文中 (HTTPS)

## ✅ 成功标准

测试成功的标准：
- [ ] 总事件数 > 50个
- [ ] 至少收集到 12/14 种事件类型
- [ ] 每种事件类型至少有1个实例
- [ ] 数据清洗脚本能正常处理导出的数据
- [ ] 统计信息显示合理的事件分布

## 📝 测试报告模板

完成测试后，请填写以下报告：

```
测试日期: YYYY-MM-DD
测试环境: Firefox版本 + 系统信息
扩展版本: 1.3.0

收集到的事件类型数量: __/14
总事件数: ___个

成功收集的事件类型:
✅ user_action_click: ___个
✅ user_action_keydown: ___个  
✅ user_action_text_input: ___个
❓ user_action_scroll: ___个
❓ user_action_mouse_pattern: ___个
❓ user_action_form_submit: ___个
❓ user_action_focus_change: ___个
❓ user_action_page_visibility: ___个
❓ user_action_mouse_hover: ___个
❓ user_action_clipboard: ___个
✅ browser_action_tab_created: ___个
✅ browser_action_tab_activated: ___个
✅ browser_action_tab_updated: ___个
❓ browser_action_tab_removed: ___个

遇到的问题:
- 
- 

数据质量评估: 优秀/良好/需改进
```

---

**💡 提示**: 建议先完成基础交互事件测试，确认主要功能正常后，再进行高级事件的详细测试。