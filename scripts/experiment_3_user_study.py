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
        
        # 1. 动作类型分布
        action_counts = self.df['action_subtype'].value_counts().head(10)
        axes[0, 0].bar(range(len(action_counts)), action_counts.values)
        axes[0, 0].set_title(f'动作类型分布 ({self.user_group}组)')
        axes[0, 0].set_xticks(range(len(action_counts)))
        axes[0, 0].set_xticklabels(action_counts.index, rotation=45)
        axes[0, 0].set_ylabel('频次')
        
        # 2. 时间分布（按小时）
        self.df['hour'] = self.df['datetime'].dt.hour
        hourly_activity = self.df['hour'].value_counts().sort_index()
        axes[0, 1].plot(hourly_activity.index, hourly_activity.values, 'o-')
        axes[0, 1].set_title('每小时活动分布')
        axes[0, 1].set_xlabel('小时')
        axes[0, 1].set_ylabel('事件数')
        axes[0, 1].grid(True, alpha=0.3)
        
        # 3. 事件间隔分布
        intervals = self.df['time_since_last'].dropna()
        intervals = intervals[intervals < 60]  # 只显示60秒内的间隔
        axes[1, 0].hist(intervals, bins=30, alpha=0.7)
        axes[1, 0].set_title('事件间隔分布 (≤60秒)')
        axes[1, 0].set_xlabel('间隔时间 (秒)')
        axes[1, 0].set_ylabel('频次')
        
        # 4. 会话活动时间线
        if 'session_id' in self.df.columns:
            session_lengths = self.df.groupby('session_id').size()
            axes[1, 1].bar(range(len(session_lengths)), session_lengths.values)
            axes[1, 1].set_title('各会话事件数量')
            axes[1, 1].set_xlabel('会话ID')
            axes[1, 1].set_ylabel('事件数')
        else:
            axes[1, 1].text(0.5, 0.5, '无会话数据', ha='center', va='center', 
                           transform=axes[1, 1].transAxes)
            axes[1, 1].set_title('会话分析')
        
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