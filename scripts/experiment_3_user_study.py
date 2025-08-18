#!/usr/bin/env python3
"""
Synapse Experiment 3: User Study Analysis (A/B Test)

- 分析A/B测试数据，评估预测功能的有效性
- 计算任务完成时间、点击次数等指标
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import argparse
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any
from collections import defaultdict

class UserStudyAnalyzer:
    def __init__(self, cleaned_data_file: str, user_group: str):
        self.df = pd.read_csv(cleaned_data_file)
        self.user_group = user_group  # 'test' or 'control'
        print(f"--- 分析组: {self.user_group} ---")
        print(f"数据范围: {len(self.df)} 个事件")
        
        # 预处理数据
        self.preprocess_data()

    def preprocess_data(self):
        """预处理数据"""
        # 转换时间戳
        self.df['datetime'] = pd.to_datetime(self.df['timestamp'], unit='ms')
        
        # 按时间排序
        self.df = self.df.sort_values('datetime')
        
        # 添加事件间隔
        self.df['time_since_last'] = self.df['datetime'].diff().dt.total_seconds()
        
        # 识别会话边界（超过5分钟无活动认为是新会话）
        session_breaks = self.df['time_since_last'] > 300  # 5分钟
        self.df['session_id'] = session_breaks.cumsum()
        
        # 根据CLAUDE.md要求实现任务分割
        self.segment_tasks()

    def segment_tasks(self):
        """
        实现智能任务分割功能
        根据CLAUDE.md要求：识别用户何时开始和结束一个任务
        使用特定的URL、form_submit事件或长时间静默作为任务边界标志
        """
        print(f"开始任务分割分析...")
        
        # 初始化任务ID
        self.df['task_id'] = -1
        task_counter = 0
        
        # 1. 基于URL变化的任务边界识别
        task_boundaries = set()
        
        # 检测页面导航作为任务开始标志
        page_changes = self.df['url'].ne(self.df['url'].shift())
        navigation_indices = self.df[page_changes].index.tolist()
        task_boundaries.update(navigation_indices)
        
        # 2. 基于form_submit事件的任务边界
        form_submit_events = self.df[self.df['event_type'] == 'user_action_form_submit']
        if not form_submit_events.empty:
            # form提交通常标志着一个任务的完成
            form_submit_indices = form_submit_events.index.tolist()
            task_boundaries.update(form_submit_indices)
            print(f"发现 {len(form_submit_indices)} 个表单提交事件作为任务边界")
        
        # 3. 基于长时间静默的任务边界
        # 超过30秒无活动认为是任务间的停顿
        long_pauses = self.df[self.df['time_since_last'] > 30].index.tolist()
        task_boundaries.update(long_pauses)
        print(f"发现 {len(long_pauses)} 个长时间停顿作为任务边界")
        
        # 4. 基于特定URL模式的任务开始页面识别
        task_start_urls = self.identify_task_start_pages()
        task_start_indices = self.df[self.df['url'].isin(task_start_urls)].index.tolist()
        task_boundaries.update(task_start_indices)
        
        # 5. 基于行为模式的任务边界（高级启发式）
        behavioral_boundaries = self.detect_behavioral_task_boundaries()
        task_boundaries.update(behavioral_boundaries)
        
        # 排序任务边界
        sorted_boundaries = sorted(task_boundaries)
        print(f"总共识别出 {len(sorted_boundaries)} 个潜在任务边界")
        
        # 分配任务ID
        current_task_id = 0
        last_boundary = 0
        
        for boundary in sorted_boundaries:
            # 为上一个任务段分配ID
            if boundary > last_boundary:
                self.df.loc[last_boundary:boundary-1, 'task_id'] = current_task_id
                current_task_id += 1
            last_boundary = boundary
        
        # 处理最后一个任务段
        if last_boundary < len(self.df):
            self.df.loc[last_boundary:, 'task_id'] = current_task_id
        
        # 生成任务分割报告
        self.generate_task_segmentation_report()
        
    def identify_task_start_pages(self) -> List[str]:
        """识别可能的任务开始页面"""
        task_start_patterns = [
            'dashboard', 'home', 'main', 'index',  # 主页类型
            'task', 'assignment', 'work',          # 明确的任务页面
            'new', 'create', 'add',                # 创建新内容的页面
            'login', 'signin', 'auth'              # 认证页面（新会话开始）
        ]
        
        urls = self.df['url'].dropna().unique()
        task_start_urls = []
        
        for url in urls:
            url_lower = url.lower()
            if any(pattern in url_lower for pattern in task_start_patterns):
                task_start_urls.append(url)
        
        print(f"识别出 {len(task_start_urls)} 个任务开始页面")
        return task_start_urls
    
    def detect_behavioral_task_boundaries(self) -> List[int]:
        """基于行为模式检测任务边界"""
        boundaries = []
        
        # 1. 检测"搜索-浏览-选择"模式的边界
        search_events = self.df[self.df['action_subtype'] == 'text_input']
        if not search_events.empty:
            # 搜索后的第一次点击可能是新任务的开始
            for idx in search_events.index:
                # 寻找搜索后5秒内的第一次点击
                following_events = self.df[
                    (self.df.index > idx) & 
                    (self.df['datetime'] <= search_events.loc[idx, 'datetime'] + timedelta(seconds=5))
                ]
                click_events = following_events[following_events['action_subtype'] == 'click']
                if not click_events.empty:
                    boundaries.append(click_events.index[0])
        
        # 2. 检测"复制-粘贴"操作序列的边界
        copy_events = self.df[self.df['event_type'] == 'user_action_clipboard']
        if not copy_events.empty:
            # 复制操作可能标志着信息收集任务的结束和新任务的开始
            boundaries.extend(copy_events.index.tolist())
        
        # 3. 检测页面内导航模式
        click_events = self.df[self.df['action_subtype'] == 'click']
        if len(click_events) > 1:
            # 连续快速点击后的停顿可能表示任务边界
            click_intervals = click_events['datetime'].diff().dt.total_seconds()
            rapid_clicking = click_intervals < 2  # 2秒内的连续点击
            
            # 寻找快速点击序列的结束点
            for i, is_rapid in enumerate(rapid_clicking):
                if i > 0 and not is_rapid and rapid_clicking.iloc[i-1]:
                    boundaries.append(click_events.index[i])
        
        print(f"基于行为模式检测到 {len(set(boundaries))} 个任务边界")
        return list(set(boundaries))
    
    def generate_task_segmentation_report(self):
        """生成任务分割报告"""
        if 'task_id' not in self.df.columns:
            print("任务分割未完成，跳过报告生成")
            return
            
        print(f"\n=== 任务分割报告 ===")
        
        valid_tasks = self.df[self.df['task_id'] >= 0]
        unique_tasks = valid_tasks['task_id'].nunique()
        
        print(f"总共识别出 {unique_tasks} 个任务")
        
        if unique_tasks == 0:
            print("未识别出有效任务")
            return
        
        # 计算每个任务的统计信息
        task_stats = []
        for task_id in sorted(valid_tasks['task_id'].unique()):
            task_data = valid_tasks[valid_tasks['task_id'] == task_id]
            
            if len(task_data) == 0:
                continue
                
            task_start = task_data['datetime'].min()
            task_end = task_data['datetime'].max()
            duration = (task_end - task_start).total_seconds()
            
            # 计算任务特征
            event_count = len(task_data)
            click_count = len(task_data[task_data['action_subtype'] == 'click'])
            input_count = len(task_data[task_data['action_subtype'] == 'text_input'])
            unique_urls = task_data['url'].nunique()
            
            # 判断任务类型（启发式）
            task_type = self.classify_task_type(task_data)
            
            task_stats.append({
                'task_id': task_id,
                'start_time': task_start,
                'end_time': task_end,
                'duration': duration,
                'event_count': event_count,
                'click_count': click_count,
                'input_count': input_count,
                'unique_urls': unique_urls,
                'task_type': task_type
            })
        
        # 创建DataFrame并显示统计
        task_df = pd.DataFrame(task_stats)
        
        print(f"\n任务统计摘要:")
        print(f"- 平均任务持续时间: {task_df['duration'].mean():.1f} 秒")
        print(f"- 平均每任务事件数: {task_df['event_count'].mean():.1f}")
        print(f"- 平均每任务点击数: {task_df['click_count'].mean():.1f}")
        print(f"- 平均每任务输入次数: {task_df['input_count'].mean():.1f}")
        
        # 按任务类型分组统计
        if 'task_type' in task_df.columns:
            type_stats = task_df.groupby('task_type').agg({
                'duration': ['count', 'mean'],
                'click_count': 'mean',
                'event_count': 'mean'
            }).round(2)
            
            print(f"\n按任务类型分组:")
            print(type_stats)
        
        # 保存详细的任务分割数据
        self.task_segments = task_df
        
        return task_df
    
    def classify_task_type(self, task_data: pd.DataFrame) -> str:
        """基于任务数据的特征对任务进行分类"""
        # 简单的启发式任务分类
        click_count = len(task_data[task_data['action_subtype'] == 'click'])
        input_count = len(task_data[task_data['action_subtype'] == 'text_input'])
        form_submit_count = len(task_data[task_data['event_type'] == 'user_action_form_submit'])
        unique_urls = task_data['url'].nunique()
        
        # 分类逻辑
        if form_submit_count > 0:
            return 'form_submission'
        elif input_count > click_count:
            return 'data_entry'
        elif unique_urls > 3:
            return 'browsing_navigation'
        elif click_count > 5 and input_count == 0:
            return 'pure_navigation'
        elif input_count > 0 and click_count > 0:
            return 'search_and_select'
        else:
            return 'general_interaction'

    def analyze_task_efficiency(self):
        """分析任务效率指标"""
        print(f"\n=== 任务效率分析 ===")
        
        # 定义任务模式（示例）
        task_patterns = {
            'search_task': ['text_input', 'click'],  # 搜索然后点击
            'copy_paste_task': ['click', 'keydown', 'click'],  # 选择-复制-粘贴
            'navigation_task': ['click', 'click'],  # 连续导航点击
            'form_filling': ['click', 'text_input', 'click']  # 表单填写
        }
        
        task_stats = self.detect_task_patterns(task_patterns)
        
        if not task_stats:
            print("未检测到明确的任务模式，执行基础活动分析...")
            self.analyze_basic_activities()
        else:
            self.report_task_statistics(task_stats)

    def detect_task_patterns(self, patterns: Dict[str, List[str]]) -> Dict[str, Any]:
        """检测用户任务模式"""
        task_stats = {}
        
        for task_name, pattern in patterns.items():
            tasks = self.find_pattern_sequences(pattern)
            
            if tasks:
                durations = [task['duration'] for task in tasks]
                click_counts = [task['clicks'] for task in tasks]
                
                task_stats[task_name] = {
                    'count': len(tasks),
                    'avg_duration': np.mean(durations),
                    'avg_clicks': np.mean(click_counts),
                    'success_rate': len([t for t in tasks if t['completed']]) / len(tasks),
                    'tasks': tasks
                }
        
        return task_stats

    def find_pattern_sequences(self, pattern: List[str], window_size: int = 10) -> List[Dict]:
        """在事件序列中寻找特定模式"""
        sequences = []
        
        for session_id in self.df['session_id'].unique():
            session_df = self.df[self.df['session_id'] == session_id]
            
            if len(session_df) < len(pattern):
                continue
            
            for i in range(len(session_df) - len(pattern) + 1):
                window = session_df.iloc[i:i+window_size]
                
                # 检查是否包含所需模式
                actions = window['action_subtype'].tolist()
                if self.matches_pattern(actions, pattern):
                    start_time = window['datetime'].iloc[0]
                    end_time = window['datetime'].iloc[-1]
                    duration = (end_time - start_time).total_seconds()
                    
                    # 计算任务指标
                    clicks = len(window[window['action_subtype'] == 'click'])
                    keystrokes = len(window[window['action_subtype'] == 'keydown'])
                    
                    # 简单的完成判断（如果序列包含了完整模式）
                    completed = len(actions) >= len(pattern)
                    
                    sequences.append({
                        'start_time': start_time,
                        'end_time': end_time,
                        'duration': duration,
                        'clicks': clicks,
                        'keystrokes': keystrokes,
                        'completed': completed,
                        'session_id': session_id
                    })
        
        return sequences

    def matches_pattern(self, actions: List[str], pattern: List[str]) -> bool:
        """检查动作序列是否匹配指定模式"""
        if len(actions) < len(pattern):
            return False
        
        # 简单的模式匹配：寻找连续子序列
        for i in range(len(actions) - len(pattern) + 1):
            if actions[i:i+len(pattern)] == pattern:
                return True
        
        return False

    def analyze_basic_activities(self):
        """分析基础活动模式"""
        print(f"\n--- 基础活动分析 ---")
        
        # 会话统计
        session_stats = self.df.groupby('session_id').agg({
            'datetime': ['min', 'max', 'count'],
            'action_subtype': lambda x: x.value_counts().to_dict()
        }).round(2)
        
        # 计算会话持续时间
        session_durations = []
        for session_id in self.df['session_id'].unique():
            session_df = self.df[self.df['session_id'] == session_id]
            if len(session_df) > 1:
                duration = (session_df['datetime'].max() - session_df['datetime'].min()).total_seconds()
                session_durations.append(duration)
        
        if session_durations:
            print(f"会话数量: {len(session_durations)}")
            print(f"平均会话时长: {np.mean(session_durations):.1f} 秒")
            print(f"中位数会话时长: {np.median(session_durations):.1f} 秒")
        
        # 动作频率分析
        action_counts = self.df['action_subtype'].value_counts()
        print(f"\n动作频率分布:")
        for action, count in action_counts.head(10).items():
            percentage = count / len(self.df) * 100
            print(f"  {action}: {count} 次 ({percentage:.1f}%)")

    def report_task_statistics(self, task_stats: Dict[str, Any]):
        """报告任务统计信息"""
        print(f"\n--- 检测到的任务模式 ---")
        
        for task_name, stats in task_stats.items():
            if stats['count'] > 0:
                print(f"\n{task_name}:")
                print(f"  执行次数: {stats['count']}")
                print(f"  平均完成时间: {stats['avg_duration']:.1f} 秒")
                print(f"  平均点击次数: {stats['avg_clicks']:.1f}")
                print(f"  完成率: {stats['success_rate']:.1%}")

    def analyze_prediction_impact(self):
        """分析预测功能的影响（仅适用于测试组）"""
        print(f"\n=== 预测功能影响分析 ===")
        
        # 查找预测事件
        prediction_events = self.df[self.df['event_type'] == 'internal_action_prediction_shown']
        
        if len(prediction_events) == 0:
            print("该用户没有收到任何预测通知")
            return
        
        print(f"预测通知数量: {len(prediction_events)}")
        
        # 分析预测后的用户行为
        prediction_impact = []
        
        for _, pred_event in prediction_events.iterrows():
            pred_time = pred_event['datetime']
            
            # 查看预测后10秒内的用户行为
            after_prediction = self.df[
                (self.df['datetime'] > pred_time) & 
                (self.df['datetime'] <= pred_time + timedelta(seconds=10))
            ]
            
            if len(after_prediction) > 0:
                # 统计预测后的活动
                actions_after = after_prediction['action_subtype'].tolist()
                time_to_next_action = (after_prediction['datetime'].iloc[0] - pred_time).total_seconds()
                
                prediction_impact.append({
                    'time_to_reaction': time_to_next_action,
                    'actions_count': len(actions_after),
                    'action_types': set(actions_after)
                })
        
        if prediction_impact:
            reaction_times = [p['time_to_reaction'] for p in prediction_impact]
            action_counts = [p['actions_count'] for p in prediction_impact]
            
            print(f"平均反应时间: {np.mean(reaction_times):.2f} 秒")
            print(f"预测后平均动作数: {np.mean(action_counts):.1f}")
            
            # 预测准确性（简化评估）
            successful_predictions = len([p for p in prediction_impact if p['actions_count'] > 0])
            prediction_accuracy = successful_predictions / len(prediction_impact)
            print(f"预测触发后续动作率: {prediction_accuracy:.1%}")

    def compare_with_control_group(self, control_data_file: str):
        """与对照组数据进行比较"""
        if not os.path.exists(control_data_file):
            print(f"未找到对照组数据文件: {control_data_file}")
            return
        
        print(f"\n=== 与对照组对比分析 ===")
        
        # 加载对照组数据
        control_df = pd.read_csv(control_data_file)
        control_df['datetime'] = pd.to_datetime(control_df['timestamp'], unit='ms')
        
        # 比较基础指标
        metrics_comparison = {
            '总事件数': [len(self.df), len(control_df)],
            '平均会话时长': [
                self.calculate_average_session_duration(),
                self.calculate_average_session_duration(control_df)
            ],
            '每分钟动作数': [
                self.calculate_actions_per_minute(),
                self.calculate_actions_per_minute(control_df)
            ]
        }
        
        print(f"{'指标':<15} {'测试组':<12} {'对照组':<12} {'差异':<10}")
        print("-" * 50)
        
        for metric, values in metrics_comparison.items():
            test_val, control_val = values
            diff_pct = ((test_val - control_val) / control_val * 100) if control_val != 0 else 0
            print(f"{metric:<15} {test_val:<12.2f} {control_val:<12.2f} {diff_pct:+.1f}%")

    def calculate_average_session_duration(self, df=None):
        """计算平均会话时长"""
        if df is None:
            df = self.df
        
        session_durations = []
        for session_id in df['session_id'].unique() if 'session_id' in df.columns else [0]:
            if 'session_id' in df.columns:
                session_df = df[df['session_id'] == session_id]
            else:
                session_df = df
            
            if len(session_df) > 1:
                duration = (session_df['datetime'].max() - session_df['datetime'].min()).total_seconds()
                session_durations.append(duration)
        
        return np.mean(session_durations) if session_durations else 0

    def calculate_actions_per_minute(self, df=None):
        """计算每分钟动作数"""
        if df is None:
            df = self.df
        
        if len(df) < 2:
            return 0
        
        total_time = (df['datetime'].max() - df['datetime'].min()).total_seconds() / 60  # 分钟
        return len(df) / total_time if total_time > 0 else 0

    def visualize_user_behavior(self):
        """可视化用户行为模式"""
        fig, axes = plt.subplots(2, 2, figsize=(15, 12))
        
        # Chart A: Action type distribution
        action_counts = self.df['action_subtype'].value_counts().head(10)
        axes[0, 0].bar(range(len(action_counts)), action_counts.values)
        axes[0, 0].set_title(f'(A) Action Type Distribution ({self.user_group} group)')
        axes[0, 0].set_xticks(range(len(action_counts)))
        axes[0, 0].set_xticklabels(action_counts.index, rotation=45)
        axes[0, 0].set_ylabel('Frequency')
        
        # Chart B: Hourly activity distribution
        self.df['hour'] = self.df['datetime'].dt.hour
        hourly_activity = self.df['hour'].value_counts().sort_index()
        axes[0, 1].plot(hourly_activity.index, hourly_activity.values, 'o-')
        axes[0, 1].set_title('(B) Hourly Activity Distribution')
        axes[0, 1].set_xlabel('Hour')
        axes[0, 1].set_ylabel('Event Count')
        axes[0, 1].grid(True, alpha=0.3)
        
        # Chart C: Event interval distribution
        intervals = self.df['time_since_last'].dropna()
        intervals = intervals[intervals < 60]  # Only show intervals within 60 seconds
        axes[1, 0].hist(intervals, bins=30, alpha=0.7)
        axes[1, 0].set_title('(C) Event Interval Distribution (≤60s)')
        axes[1, 0].set_xlabel('Interval Time (seconds)')
        axes[1, 0].set_ylabel('Frequency')
        
        # Chart D: Session activity timeline
        if 'session_id' in self.df.columns:
            session_lengths = self.df.groupby('session_id').size()
            axes[1, 1].bar(range(len(session_lengths)), session_lengths.values)
            axes[1, 1].set_title('(D) Events per Session')
            axes[1, 1].set_xlabel('Session ID')
            axes[1, 1].set_ylabel('Event Count')
        else:
            axes[1, 1].text(0.5, 0.5, 'No Session Data', ha='center', va='center', 
                           transform=axes[1, 1].transAxes)
            axes[1, 1].set_title('(D) Session Analysis')
        
        plt.tight_layout()
        output_file = f'experiment_3_user_behavior_{self.user_group}.png'
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"\n用户行为图表已保存至 {output_file}")
        plt.show()

    def generate_summary_report(self):
        """生成用户研究摘要报告"""
        print("\n" + "="*60)
        print(f"用户研究分析报告 - {self.user_group.upper()}组")
        print("="*60)
        
        # 数据概况
        print(f"\n数据概况:")
        print(f"- 分析组别: {self.user_group}")
        print(f"- 总事件数: {len(self.df)}")
        print(f"- 数据时间跨度: {(self.df['datetime'].max() - self.df['datetime'].min()).days} 天")
        
        if 'session_id' in self.df.columns:
            print(f"- 会话数量: {self.df['session_id'].nunique()}")
        
        # 核心指标
        avg_session_duration = self.calculate_average_session_duration()
        actions_per_minute = self.calculate_actions_per_minute()
        
        print(f"\n核心效率指标:")
        print(f"- 平均会话时长: {avg_session_duration:.1f} 秒")
        print(f"- 每分钟动作数: {actions_per_minute:.1f}")
        
        # 特殊分析（测试组）
        if self.user_group == 'test':
            prediction_events = self.df[self.df['event_type'] == 'internal_action_prediction_shown']
            if len(prediction_events) > 0:
                print(f"\nA/B测试特定指标:")
                print(f"- 收到预测通知数: {len(prediction_events)}")
                print(f"- 预测通知频率: {len(prediction_events)/len(self.df)*100:.2f}%")
        
        # 建议
        print(f"\n分析建议:")
        if actions_per_minute > 10:
            print("- 用户活动频率较高，可能受益于更智能的预测")
        elif actions_per_minute < 2:
            print("- 用户活动频率较低，可能需要更精准的预测时机")
        else:
            print("- 用户活动频率适中，预测系统有良好的优化潜力")

def main():
    parser = argparse.ArgumentParser(description='实验三: 用户研究数据分析')
    parser.add_argument('input_file', help='单个用户导出的清洗后CSV数据')
    parser.add_argument('--group', choices=['test', 'control'], required=True, 
                       help='该用户所属的组')
    parser.add_argument('--compare', help='对照组数据文件路径（可选）')
    parser.add_argument('--skip-viz', action='store_true', help='跳过可视化图表生成')
    args = parser.parse_args()
    
    if not os.path.exists(args.input_file):
        print(f"错误：找不到输入文件 {args.input_file}")
        return
    
    # 检查数据量
    df_check = pd.read_csv(args.input_file)
    if len(df_check) < 10:
        print("警告：数据量很少，分析结果可能不够可靠")
        print(f"当前数据量: {len(df_check)} 行")
    
    # 执行分析
    analyzer = UserStudyAnalyzer(args.input_file, args.group)
    
    # 基础分析
    analyzer.analyze_task_efficiency()
    
    # 测试组特殊分析
    if args.group == 'test':
        analyzer.analyze_prediction_impact()
    
    # 对照组比较
    if args.compare:
        analyzer.compare_with_control_group(args.compare)
    
    # 可视化
    if not args.skip_viz:
        analyzer.visualize_user_behavior()
    
    # 生成报告
    analyzer.generate_summary_report()

if __name__ == "__main__":
    main()