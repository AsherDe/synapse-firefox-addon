# Synapse 针对性数据收集流程 v2.0

## 🎯 目标：收集7种缺失事件类型

基于门槛值优化后，本流程专门针对以下7种未收集到的事件类型：

1. `user_action_scroll` - 滚动事件
2. `user_action_mouse_pattern` - 鼠标模式 
3. `user_action_form_submit` - 表单提交
4. `user_action_focus_change` - 焦点变化
5. `user_action_page_visibility` - 页面可见性
6. `user_action_mouse_hover` - 鼠标悬停
7. `user_action_clipboard` - 剪贴板操作

---

## 📋 预备工作

### 1. 扩展状态确认
- [ ] 重新加载Synapse扩展（应用新的门槛值）
- [ ] 打开开发者工具(F12)，切换到Console标签
- [ ] 在扩展弹窗中点击"Clear"清空之前数据
- [ ] 确认扩展显示"Pause"按钮（未暂停状态）

### 2. 监控设置
在浏览器控制台运行以下代码来实时监控事件：

```javascript
// 实时监控7种目标事件
const targetEvents = [
  'user_action_scroll',
  'user_action_mouse_pattern', 
  'user_action_form_submit',
  'user_action_focus_change',
  'user_action_page_visibility',
  'user_action_mouse_hover',
  'user_action_clipboard'
];

const originalSendMessage = chrome.runtime.sendMessage;
chrome.runtime.sendMessage = function(message, ...args) {
  if (message && message.type && targetEvents.includes(message.type)) {
    console.log('🎯 TARGET EVENT:', message.type, message);
  }
  return originalSendMessage.call(this, message, ...args);
};
```

---

## 🔄 针对性测试流程

### 阶段1: 滚动事件收集 (user_action_scroll)

**目标**: 收集至少5个滚动事件  
**新门槛**: 20px滚动距离

#### 测试步骤:
1. **打开长页面**
   - [ ] 访问 https://en.wikipedia.org/wiki/Isaac_Newton
   - [ ] 等待页面完全加载

2. **执行多种滚动操作**
   - [ ] 缓慢向下滚动至少30px (超过20px门槛)
   - [ ] 停顿2秒
   - [ ] 向上滚动至少30px
   - [ ] 停顿2秒
   - [ ] 快速向下滚动100px
   - [ ] 使用Page Down键滚动
   - [ ] 使用鼠标滚轮滚动

3. **验证收集**
   - [ ] 在控制台查看是否出现"🎯 TARGET EVENT: user_action_scroll"
   - [ ] 期望至少看到3-5个滚动事件

---

### 阶段2: 鼠标模式收集 (user_action_mouse_pattern)

**目标**: 收集至少3个鼠标模式  
**新门槛**: 显著性0.02，距离30px

#### 测试步骤:
1. **保持在长页面**
   - [ ] 继续在Wikipedia页面操作

2. **执行特定鼠标模式**
   - [ ] **圆圈模式**: 用鼠标画3个大圆圈（直径>60px）
   - [ ] 停顿1秒等待去抖完成
   - [ ] **锯齿模式**: 快速左右移动鼠标形成锯齿状（总距离>60px）
   - [ ] 停顿1秒
   - [ ] **直线快速移动**: 从屏幕左侧快速移动到右侧
   - [ ] 停顿1秒
   - [ ] **曲线模式**: 画S形曲线

3. **验证收集**
   - [ ] 在控制台查看"🎯 TARGET EVENT: user_action_mouse_pattern"
   - [ ] 期望至少看到2-3个鼠标模式事件

---

### 阶段3: 表单提交收集 (user_action_form_submit)

**目标**: 收集至少2个表单提交事件  
**增强**: 添加了按钮点击备选监听

#### 测试步骤:
1. **访问测试表单页面**
   - [ ] 打开新标签页，访问 https://httpbin.org/forms/post
   - [ ] 等待页面加载完成

2. **填写并提交表单**
   - [ ] 填写Customer name: "Test User"
   - [ ] 填写Telephone: "123-456-7890"  
   - [ ] 填写Email: "test@example.com"
   - [ ] 选择Size: Small
   - [ ] 选择Toppings: Bacon, Cheese
   - [ ] 填写Delivery time: "ASAP"
   - [ ] 填写Comments: "Test form submission"
   - [ ] **点击"Submit order"按钮**

3. **第二次表单提交测试**
   - [ ] 返回表单页面
   - [ ] 快速填写必要字段
   - [ ] 再次点击提交

4. **验证收集**
   - [ ] 在控制台查看"🎯 TARGET EVENT: user_action_form_submit"
   - [ ] 期望看到1-2个表单提交事件

---

### 阶段4: 焦点变化收集 (user_action_focus_change)

**目标**: 收集至少5个焦点变化事件

#### 测试步骤:
1. **使用多输入框页面**
   - [ ] 继续在httpbin表单页面操作

2. **执行焦点切换操作**
   - [ ] 点击Customer name输入框（获得焦点）
   - [ ] 点击Telephone输入框（焦点切换）
   - [ ] 点击Email输入框（焦点切换）
   - [ ] 使用Tab键切换到下一个字段
   - [ ] 使用Tab键再次切换
   - [ ] 点击页面空白区域（失去焦点）
   - [ ] 再次点击任意输入框

3. **验证收集**
   - [ ] 在控制台查看"🎯 TARGET EVENT: user_action_focus_change"
   - [ ] 期望看到4-6个焦点变化事件

---

### 阶段5: 页面可见性收集 (user_action_page_visibility)

**目标**: 收集至少4个可见性变化事件

#### 测试步骤:
1. **执行可见性切换操作**
   - [ ] 最小化浏览器窗口（hidden）
   - [ ] 等待2秒
   - [ ] 恢复浏览器窗口（visible）
   - [ ] 等待2秒
   - [ ] 按Alt+Tab切换到其他应用程序（hidden）
   - [ ] 等待2秒  
   - [ ] 按Alt+Tab返回浏览器（visible）
   - [ ] 等待2秒

2. **验证收集**
   - [ ] 在控制台查看"🎯 TARGET EVENT: user_action_page_visibility"
   - [ ] 期望看到3-4个页面可见性事件

---

### 阶段6: 鼠标悬停收集 (user_action_mouse_hover)

**目标**: 收集至少4个悬停事件  
**新门槛**: 100ms悬停时间

#### 测试步骤:
1. **在有链接的页面执行悬停**
   - [ ] 切换到Wikipedia页面
   
2. **执行悬停操作**
   - [ ] 将鼠标悬停在"Isaac Newton"链接上，保持2秒
   - [ ] 移开鼠标
   - [ ] 悬停在导航菜单项上，保持2秒
   - [ ] 移开鼠标
   - [ ] 悬停在任意图片上，保持2秒
   - [ ] 移开鼠标
   - [ ] 悬停在页面内其他链接上，保持2秒

3. **验证收集**
   - [ ] 在控制台查看"🎯 TARGET EVENT: user_action_mouse_hover"
   - [ ] 期望看到3-4个鼠标悬停事件

---

### 阶段7: 剪贴板操作收集 (user_action_clipboard)

**目标**: 收集至少6个剪贴板事件

#### 测试步骤:
1. **执行复制操作**
   - [ ] 在Wikipedia页面选择一段文字
   - [ ] 按Ctrl+C复制
   - [ ] 选择另一段文字
   - [ ] 按Ctrl+C再次复制

2. **执行粘贴操作**
   - [ ] 切换到httpbin表单页面
   - [ ] 点击Comments输入框
   - [ ] 按Ctrl+V粘贴
   - [ ] 清空输入框
   - [ ] 再次按Ctrl+V粘贴

3. **执行剪切操作**
   - [ ] 在Comments输入框中选择部分文字
   - [ ] 按Ctrl+X剪切
   - [ ] 在另一个输入框中按Ctrl+V粘贴

4. **验证收集**
   - [ ] 在控制台查看"🎯 TARGET EVENT: user_action_clipboard"
   - [ ] 期望看到4-6个剪贴板事件

---

## 📊 数据验证检查

### 完成测试后的验证
1. **导出数据**
   - [ ] 打开扩展弹窗，点击"DevMode"
   - [ ] 点击"Export Data"
   - [ ] 保存为 `targeted-collection-YYYY-MM-DD.json`

2. **检查事件分布**
   期望的最低事件数量：
   ```json
   {
     "event_type_counts": {
       "user_action_scroll": "≥ 3",
       "user_action_mouse_pattern": "≥ 2", 
       "user_action_form_submit": "≥ 1",
       "user_action_focus_change": "≥ 4",
       "user_action_page_visibility": "≥ 3",
       "user_action_mouse_hover": "≥ 3",
       "user_action_clipboard": "≥ 4"
     }
   }
   ```

3. **运行数据清洗脚本**
   ```bash
   python scripts/clean_debug_data.py targeted-collection-YYYY-MM-DD.json --stats targeted-stats.json
   ```

---

## 🐛 故障排除

### 如果某个事件类型仍未收集到：

#### user_action_scroll 故障排除
- [ ] 确保页面足够长可以滚动
- [ ] 滚动距离超过20px
- [ ] 尝试不同滚动方式（鼠标滚轮、键盘、拖拽）

#### user_action_mouse_pattern 故障排除  
- [ ] 画更大的图形（>60px）
- [ ] 增加方向变化次数
- [ ] 等待去抖完成（30ms）

#### user_action_form_submit 故障排除
- [ ] 确保点击的是submit类型按钮
- [ ] 尝试不同的表单网站
- [ ] 检查按钮文字是否包含"submit"

#### user_action_focus_change 故障排除
- [ ] 确保点击的是可聚焦元素
- [ ] 尝试Tab键导航
- [ ] 点击输入框外的区域

#### user_action_page_visibility 故障排除
- [ ] 完全最小化窗口
- [ ] 切换到其他应用程序
- [ ] 检查浏览器是否支持visibilitychange事件

#### user_action_mouse_hover 故障排除
- [ ] 悬停时间超过100ms
- [ ] 悬停在不同类型元素上
- [ ] 确保鼠标完全移开目标元素

#### user_action_clipboard 故障排除
- [ ] 确保网站在HTTPS下运行
- [ ] 检查浏览器剪贴板权限
- [ ] 尝试不同的复制粘贴操作

---

## ✅ 成功标准

完成本流程后应该达到：
- [ ] 总事件数 > 80个
- [ ] 收集到所有7种目标事件类型
- [ ] 每种事件类型至少2个实例
- [ ] 事件分布合理，无异常数据

---

## 📈 数据质量评估

**优秀** (90-100%): 收集到全部7种事件，每种≥3个实例  
**良好** (70-89%): 收集到6种事件，大部分≥2个实例  
**及格** (50-69%): 收集到5种事件，每种≥1个实例  
**需改进** (<50%): 收集到<5种事件

---

*最后更新: 2025-08-19*  
*针对门槛值优化后的专项收集流程*