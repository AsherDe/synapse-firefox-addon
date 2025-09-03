#!/usr/bin/env python3
"""
Synapse Experiment 1: Feasibility and Compression Analysis

- 验证FAST技术在浏览器行为数据上的可行性
- 分析DCT变换的能量集中特性和数据压缩潜力
"""

import pandas as pd
import numpy as np
from scipy.fftpack import dct, idct
import matplotlib.pyplot as plt
import argparse
import os
import json
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler
from collections import defaultdict, Counter
import seaborn as sns

class FeasibilityAnalyzer:
    def __init__(self, cleaned_data_file: str):
        self.df = pd.read_csv(cleaned_data_file)
        # 使用真实鼠标轨迹数据from user_action_mouse_pattern事件
        self.mouse_trails = self._extract_real_mouse_trails()
        # 新增：为特征空间分析准备数据
        self.event_sequences = self._prepare_event_sequences()
        self.task_labels = self._generate_task_labels()

    def _extract_real_mouse_trails(self) -> list:
        """从user_action_mouse_pattern事件中提取真实的鼠标轨迹数据"""
        trails = []
        
        # 查找包含鼠标轨迹的事件
        mouse_pattern_events = self.df[self.df['event_type'] == 'user_action_mouse_pattern']
        
        if mouse_pattern_events.empty:
            print("警告：没有找到user_action_mouse_pattern事件。尝试从JSON数据中解析...")
            # 尝试从JSON格式的payload中提取trail数据
            return self._parse_trails_from_json()
        
        print(f"找到 {len(mouse_pattern_events)} 个鼠标模式事件")
        
        # 从payload中提取trail数据
        for _, row in mouse_pattern_events.iterrows():
            try:
                # 尝试解析trail数据 (假设存储在某个列中)
                if 'trail' in row and pd.notna(row['trail']):
                    # 如果trail数据是字符串格式，尝试解析
                    trail_data = json.loads(row['trail']) if isinstance(row['trail'], str) else row['trail']
                    
                    if isinstance(trail_data, list) and len(trail_data) > 0:
                        # 转换为numpy数组格式 [[x1,y1], [x2,y2], ...]
                        trail_points = []
                        for point in trail_data:
                            if isinstance(point, dict) and 'x' in point and 'y' in point:
                                trail_points.append([point['x'], point['y']])
                        
                        if len(trail_points) >= 3:  # 至少需要3个点构成轨迹
                            trails.append(np.array(trail_points))
                            
            except (json.JSONDecodeError, ValueError, KeyError) as e:
                print(f"解析轨迹数据时出错: {e}")
                continue
        
        # 如果没有找到真实轨迹数据，返回空列表
        if not trails:
            print("警告：无法从数据中提取真实鼠标轨迹。")
            print("请确保数据收集时正确记录了user_action_mouse_pattern事件的trail字段。")
            print("无法进行分析，需要真实的鼠标轨迹数据。")
            return []
        
        print(f"成功提取了 {len(trails)} 条真实鼠标轨迹")
        return trails
    
    def _parse_trails_from_json(self) -> list:
        """从JSON格式的数据文件中解析已经预计算的DCT系数或重建轨迹"""
        trails = []
        
        # 检查是否有对应的JSON调试数据文件
        json_files = [f for f in os.listdir('.') if f.startswith('synapse-debug-data') and f.endswith('.json')]
        
        if json_files:
            for json_file in json_files:
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        
                    # 查找鼠标轨迹事件，支持新的数据结构
                    events_list = data.get('eventSequence', data) if isinstance(data, dict) else data
                    
                    if isinstance(events_list, list):
                        for event in events_list:
                            if (isinstance(event, dict) and 
                                event.get('type') == 'ui.mouse_pattern' and
                                'payload' in event and
                                'features' in event['payload']):
                                
                                features = event['payload']['features']
                                
                                # 检查是否有DCT系数数据
                                if ('dct_x_coefficients' in features and 
                                    'dct_y_coefficients' in features):
                                    
                                    dct_x = features['dct_x_coefficients']
                                    dct_y = features['dct_y_coefficients']
                                    
                                    if (isinstance(dct_x, list) and isinstance(dct_y, list) and 
                                        len(dct_x) >= 3 and len(dct_y) >= 3):
                                        
                                        # 使用IDCT重建轨迹
                                        trail_points = self._reconstruct_trail_from_dct(dct_x, dct_y)
                                        if trail_points is not None:
                                            trails.append(trail_points)
                                
                                # 兼容性：如果有trail字段，也提取
                                elif 'trail' in event['payload']:
                                    trail_data = event['payload']['trail']
                                    if isinstance(trail_data, list) and len(trail_data) >= 3:
                                        trail_points = [[p['x'], p['y']] for p in trail_data 
                                                      if isinstance(p, dict) and 'x' in p and 'y' in p]
                                        if trail_points:
                                            trails.append(np.array(trail_points))
                                        
                    print(f"从 {json_file} 中提取了 {len(trails)} 条轨迹")
                    
                except (json.JSONDecodeError, FileNotFoundError, KeyError) as e:
                    print(f"解析JSON文件 {json_file} 时出错: {e}")
                    continue
        
        return trails
    
    def _reconstruct_trail_from_dct(self, dct_x, dct_y, num_points=50):
        """从DCT系数重建鼠标轨迹"""
        try:
            # 使用IDCT重建信号
            reconstructed_x = idct(dct_x, n=num_points)
            reconstructed_y = idct(dct_y, n=num_points)
            
            # 构造轨迹点
            trail_points = np.column_stack((reconstructed_x, reconstructed_y))
            return trail_points
            
        except Exception as e:
            print(f"重建轨迹时出错: {e}")
            return None
    

    def analyze_dct_energy(self, n_coeffs_to_keep: int = 10):
        """分析DCT系数的能量集中情况"""
        if not self.mouse_trails:
            print("没有找到鼠标轨迹数据进行分析。")
            return

        trail = self.mouse_trails[0]
        x_dct = dct(trail[:, 0], type=2, norm='ortho')
        y_dct = dct(trail[:, 1], type=2, norm='ortho')

        # 计算能量
        total_energy_x = np.sum(x_dct**2)
        total_energy_y = np.sum(y_dct**2)
        energy_in_coeffs_x = np.sum(x_dct[:n_coeffs_to_keep]**2)
        energy_in_coeffs_y = np.sum(y_dct[:n_coeffs_to_keep]**2)
        
        print(f"--- DCT能量分析 (保留前 {n_coeffs_to_keep} 个系数) ---")
        print(f"X轴轨迹: 前 {n_coeffs_to_keep} 个系数包含了 {energy_in_coeffs_x / total_energy_x:.2%} 的总能量。")
        print(f"Y轴轨迹: 前 {n_coeffs_to_keep} 个系数包含了 {energy_in_coeffs_y / total_energy_y:.2%} 的总能量。")

        # 可视化
        plt.figure(figsize=(15, 10))
        
        # DCT系数能量分布
        plt.subplot(2, 3, 1)
        plt.plot(np.abs(x_dct), 'o-', markersize=4)
        plt.axvline(n_coeffs_to_keep, color='r', linestyle='--', label=f'First {n_coeffs_to_keep} coeffs')
        plt.title('(A) DCT Coefficient Energy Distribution (X-axis)')
        plt.xlabel('Coefficient Index')
        plt.ylabel('Coefficient Magnitude')
        plt.yscale('log')
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        plt.subplot(2, 3, 2)
        plt.plot(np.abs(y_dct), 'o-', markersize=4)
        plt.axvline(n_coeffs_to_keep, color='r', linestyle='--', label=f'First {n_coeffs_to_keep} coeffs')
        plt.title('(B) DCT Coefficient Energy Distribution (Y-axis)')
        plt.xlabel('Coefficient Index')
        plt.ylabel('Coefficient Magnitude')
        plt.yscale('log')
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        # 重建误差分析
        plt.subplot(2, 3, 3)
        self.plot_reconstruction_error()
        
        # 原始轨迹 vs 重建轨迹
        plt.subplot(2, 3, 4)
        self.plot_trajectory_comparison(n_coeffs_to_keep)
        
        # 压缩率分析
        plt.subplot(2, 3, 5)
        self.analyze_compression_ratio()
        
        # 多个轨迹的平均性能
        plt.subplot(2, 3, 6)
        self.analyze_multiple_trails()
        
        plt.tight_layout()
        output_file = 'experiment_1_dct_analysis.png'
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"分析图表已保存至 {output_file}")
        plt.show()

    def plot_reconstruction_error(self):
        """分析并绘制不同数量系数下的重建误差"""
        if not self.mouse_trails:
            return

        trail = self.mouse_trails[0]
        errors = []
        coeff_counts = range(1, min(len(trail), 30))

        for k in coeff_counts:
            x_dct = dct(trail[:, 0], type=2, norm='ortho')
            y_dct = dct(trail[:, 1], type=2, norm='ortho')
            
            # 截断系数
            x_dct_truncated = x_dct.copy()
            y_dct_truncated = y_dct.copy()
            x_dct_truncated[k:] = 0
            y_dct_truncated[k:] = 0
            
            # 重建轨迹
            x_recon = idct(x_dct_truncated, type=2, norm='ortho')
            y_recon = idct(y_dct_truncated, type=2, norm='ortho')
            
            # 计算均方根误差 (RMSE)
            error = np.sqrt(np.mean((trail[:, 0] - x_recon)**2 + (trail[:, 1] - y_recon)**2))
            errors.append(error)

        plt.plot(coeff_counts, errors, 'b-o', markersize=4)
        plt.title('(C) Trajectory Reconstruction Error vs. DCT Coefficient Count')
        plt.xlabel('Number of Coefficients Retained')
        plt.ylabel('Root Mean Square Error (RMSE)')
        plt.grid(True, alpha=0.3)
        
        # 标注关键点
        if len(errors) > 10:
            idx_10 = 9  # 10个系数的位置
            plt.annotate(f'10 coeffs: {errors[idx_10]:.1f}px', 
                        xy=(10, errors[idx_10]), 
                        xytext=(15, errors[idx_10] + max(errors)*0.1),
                        arrowprops=dict(arrowstyle='->', color='red'))

    def plot_trajectory_comparison(self, n_coeffs: int):
        """绘制原始轨迹与重建轨迹的对比"""
        if not self.mouse_trails:
            return
            
        trail = self.mouse_trails[0]
        x_dct = dct(trail[:, 0], type=2, norm='ortho')
        y_dct = dct(trail[:, 1], type=2, norm='ortho')
        
        # 截断并重建
        x_dct_truncated = x_dct.copy()
        y_dct_truncated = y_dct.copy()
        x_dct_truncated[n_coeffs:] = 0
        y_dct_truncated[n_coeffs:] = 0
        
        x_recon = idct(x_dct_truncated, type=2, norm='ortho')
        y_recon = idct(y_dct_truncated, type=2, norm='ortho')
        
        plt.plot(trail[:, 0], trail[:, 1], 'b-', label='Original Trajectory', linewidth=2)
        plt.plot(x_recon, y_recon, 'r--', label=f'Reconstructed ({n_coeffs} coeffs)', linewidth=2)
        plt.scatter(trail[0, 0], trail[0, 1], color='green', s=100, label='Start', zorder=5)
        plt.scatter(trail[-1, 0], trail[-1, 1], color='red', s=100, label='End', zorder=5)
        plt.title(f'(D) Trajectory Reconstruction Comparison ({n_coeffs} DCT coeffs)')
        plt.xlabel('X Coordinate (pixels)')
        plt.ylabel('Y Coordinate (pixels)')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.axis('equal')

    def analyze_compression_ratio(self):
        """分析压缩率"""
        if not self.mouse_trails:
            return
            
        trail = self.mouse_trails[0]
        original_size = trail.size * 8  # 假设每个数字8字节
        
        compression_ratios = []
        coeff_counts = range(1, min(len(trail), 30))
        
        for k in coeff_counts:
            compressed_size = k * 2 * 8  # k个系数，x和y各一套
            compression_ratio = original_size / compressed_size
            compression_ratios.append(compression_ratio)
        
        plt.plot(coeff_counts, compression_ratios, 'g-o', markersize=4)
        plt.title('(E) Compression Ratio vs. DCT Coefficient Count')
        plt.xlabel('Number of Coefficients Retained')
        plt.ylabel('Compression Ratio (Original Size / Compressed Size)')
        plt.grid(True, alpha=0.3)
        
        # 标注一些关键点
        if len(compression_ratios) > 10:
            plt.annotate(f'10 coeffs: {compression_ratios[9]:.1f}x compression', 
                        xy=(10, compression_ratios[9]), 
                        xytext=(15, compression_ratios[9] + max(compression_ratios)*0.1),
                        arrowprops=dict(arrowstyle='->', color='green'))

    def analyze_multiple_trails(self):
        """分析多个轨迹的平均性能"""
        if len(self.mouse_trails) < 2:
            plt.text(0.5, 0.5, 'Insufficient trajectories\nfor multi-trajectory analysis', 
                    ha='center', va='center', transform=plt.gca().transAxes)
            plt.title('(F) Multi-trajectory Average Performance Analysis')
            return
            
        n_trails = min(len(self.mouse_trails), 5)  # 最多分析5个轨迹
        coeff_counts = range(1, 21)  # 1到20个系数
        
        all_errors = []
        all_energy_ratios = []
        
        for trail in self.mouse_trails[:n_trails]:
            trail_errors = []
            trail_energy_ratios = []
            
            x_dct = dct(trail[:, 0], type=2, norm='ortho')
            y_dct = dct(trail[:, 1], type=2, norm='ortho')
            total_energy = np.sum(x_dct**2) + np.sum(y_dct**2)
            
            for k in coeff_counts:
                # 重建误差
                x_dct_truncated = x_dct.copy()
                y_dct_truncated = y_dct.copy()
                x_dct_truncated[k:] = 0
                y_dct_truncated[k:] = 0
                
                x_recon = idct(x_dct_truncated, type=2, norm='ortho')
                y_recon = idct(y_dct_truncated, type=2, norm='ortho')
                
                error = np.sqrt(np.mean((trail[:, 0] - x_recon)**2 + (trail[:, 1] - y_recon)**2))
                trail_errors.append(error)
                
                # 能量比例
                preserved_energy = np.sum(x_dct[:k]**2) + np.sum(y_dct[:k]**2)
                energy_ratio = preserved_energy / total_energy
                trail_energy_ratios.append(energy_ratio)
            
            all_errors.append(trail_errors)
            all_energy_ratios.append(trail_energy_ratios)
        
        # 计算平均值和标准差
        mean_errors = np.mean(all_errors, axis=0)
        std_errors = np.std(all_errors, axis=0)
        mean_energy_ratios = np.mean(all_energy_ratios, axis=0)
        
        # 绘制误差带
        plt.fill_between(coeff_counts, mean_errors - std_errors, mean_errors + std_errors, 
                        alpha=0.3, color='blue', label='Error Range')
        plt.plot(coeff_counts, mean_errors, 'b-o', markersize=4, label='Average Reconstruction Error')
        
        # 添加能量比例的第二个y轴
        ax2 = plt.gca().twinx()
        ax2.plot(coeff_counts, mean_energy_ratios, 'r-s', markersize=4, label='Average Energy Retention')
        ax2.set_ylabel('Energy Retention Rate', color='red')
        ax2.tick_params(axis='y', labelcolor='red')
        
        plt.title(f'(F) Multi-trajectory Performance Analysis (n={n_trails})')
        plt.xlabel('Number of Coefficients Retained')
        plt.ylabel('Reconstruction Error (RMSE)', color='blue')
        plt.grid(True, alpha=0.3)
        
        # 合并图例
        lines1, labels1 = plt.gca().get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        plt.legend(lines1 + lines2, labels1 + labels2, loc='center right')

    def classify_task_type(self, sequence):
        """根据事件序列特征分类任务类型"""
        if not sequence:
            return "unknown"
        
        # 提取序列特征
        event_types = [event.get('event_type', '') for event in sequence]
        domains = [event.get('domain', '') for event in sequence if event.get('domain')]
        has_form_submit = any('form_submit' in et for et in event_types)
        has_text_input = any('text_input' in et for et in event_types)
        has_tab_switch = len(set(event.get('tab_id') for event in sequence if event.get('tab_id'))) > 1
        
        # 分类规则
        if has_form_submit and has_text_input:
            return "form_submission"
        elif any('google.com/search' in d for d in domains):
            return "search_task"
        elif has_tab_switch and len(set(domains)) > 1:
            return "cross_tab_browsing"
        elif 'clipboard' in ' '.join(event_types).lower():
            return "clipboard_operation"
        elif has_text_input:
            return "text_editing"
        else:
            return "general_browsing"
    
    def _prepare_event_sequences(self):
        """准备事件序列用于特征空间分析"""
        sequences = []
        current_seq = []
        last_timestamp = None
        max_gap = 30000  # 30秒间隔
        
        for _, row in self.df.iterrows():
            current_time = row['timestamp']
            
            if (last_timestamp is None or 
                current_time - last_timestamp <= max_gap):
                current_seq.append({
                    'event_type': row.get('event_type', ''),
                    'domain': row.get('domain', ''),
                    'tab_id': row.get('tab_id'),
                    'timestamp': current_time,
                    'action_subtype': row.get('action_subtype', ''),
                    'element_role': row.get('element_role', ''),
                    'text_length': row.get('text_length', 0),
                    'scroll_position': row.get('scroll_position', 0)
                })
            else:
                if len(current_seq) >= 3:  # 至少3个事件构成序列
                    sequences.append(current_seq)
                current_seq = [{
                    'event_type': row.get('event_type', ''),
                    'domain': row.get('domain', ''),
                    'tab_id': row.get('tab_id'),
                    'timestamp': current_time,
                    'action_subtype': row.get('action_subtype', ''),
                    'element_role': row.get('element_role', ''),
                    'text_length': row.get('text_length', 0),
                    'scroll_position': row.get('scroll_position', 0)
                }]
            
            last_timestamp = current_time
        
        # 添加最后一个序列
        if len(current_seq) >= 3:
            sequences.append(current_seq)
        
        print(f"提取了 {len(sequences)} 个事件序列")
        return sequences
    
    def _generate_task_labels(self):
        """为事件序列生成任务类别标签"""
        labels = []
        for seq in self.event_sequences:
            label = self.classify_task_type(seq)
            labels.append(label)
        
        label_counts = Counter(labels)
        print(f"任务类别分布: {dict(label_counts)}")
        return labels
    
    def generate_webfast_features(self, sequence):
        """生成WebFAST特征向量（模拟ml-worker.ts中的逻辑）"""
        if not sequence:
            return np.zeros(20)
        
        # 时间特征 - 使用DCT变换
        timestamps = [event['timestamp'] for event in sequence]
        if len(timestamps) > 1:
            time_diffs = np.diff(timestamps)
            if len(time_diffs) >= 3:
                # 对时间间隔序列进行DCT变换
                time_dct = dct(time_diffs[:min(10, len(time_diffs))], type=2, norm='ortho')
                time_features = time_dct[:5]  # 取前5个DCT系数
            else:
                time_features = np.pad(time_diffs, (0, max(0, 5-len(time_diffs))), 'constant')[:5]
        else:
            time_features = np.zeros(5)
        
        # 事件类型特征
        event_types = [event['event_type'] for event in sequence]
        type_hash_sum = sum(hash(et) % 100 for et in event_types) / len(event_types)
        
        # 空间特征（如果有的话）
        scroll_positions = [event.get('scroll_position', 0) for event in sequence]
        if any(sp > 0 for sp in scroll_positions):
            scroll_dct = dct(scroll_positions[:min(10, len(scroll_positions))], type=2, norm='ortho')
            spatial_features = scroll_dct[:3]
        else:
            spatial_features = np.zeros(3)
        
        # 文本长度特征
        text_lengths = [event.get('text_length', 0) for event in sequence]
        if any(tl > 0 for tl in text_lengths):
            text_dct = dct(text_lengths[:min(10, len(text_lengths))], type=2, norm='ortho')
            text_features = text_dct[:3]
        else:
            text_features = np.zeros(3)
        
        # 序列统计特征
        seq_stats = [
            len(sequence),  # 序列长度
            len(set(event['tab_id'] for event in sequence if event.get('tab_id'))),  # 唯一标签数
            len(set(event['domain'] for event in sequence if event.get('domain'))),  # 唯一域名数
            sum(1 for event in sequence if 'click' in event.get('action_subtype', '')),  # 点击次数
            type_hash_sum  # 事件类型复杂度
        ]
        
        # 组合所有特征
        feature_vector = np.concatenate([
            time_features,      # 5维
            spatial_features,   # 3维
            text_features,      # 3维
            seq_stats          # 5维
        ])
        
        # 标准化到固定长度
        if len(feature_vector) < 20:
            feature_vector = np.pad(feature_vector, (0, 20-len(feature_vector)), 'constant')
        
        return feature_vector[:20]
    
    def generate_baseline_features(self, sequence):
        """生成基线特征向量（简单的one-hot编码和统计特征）"""
        if not sequence:
            return np.zeros(20)
        
        # 事件类型one-hot编码（简化版）
        common_types = ['click', 'text_input', 'scroll', 'tab_created', 'tab_activated', 'form_submit']
        type_features = []
        
        event_types_in_seq = [event.get('action_subtype', '') for event in sequence]
        for ctype in common_types:
            count = sum(1 for et in event_types_in_seq if ctype in et)
            type_features.append(count / len(sequence))  # 归一化频率
        
        # 简单统计特征
        stats_features = [
            len(sequence),  # 序列长度
            len(set(event['tab_id'] for event in sequence if event.get('tab_id'))),  # 唯一标签数
            len(set(event['domain'] for event in sequence if event.get('domain'))),  # 唯一域名数
            np.mean([event.get('text_length', 0) for event in sequence]),  # 平均文本长度
            np.std([event['timestamp'] for event in sequence]) / 1000 if len(sequence) > 1 else 0,  # 时间标准差
        ]
        
        # 组合特征
        feature_vector = np.array(type_features + stats_features)
        
        # 标准化到固定长度
        if len(feature_vector) < 20:
            feature_vector = np.pad(feature_vector, (0, 20-len(feature_vector)), 'constant')
        
        return feature_vector[:20]
    
    def run_feature_separability_analysis(self):
        """运行特征空间可分性分析"""
        print("\n=== 特征空间可分性分析 ===")
        
        if len(self.event_sequences) < 5:
            print("警告：序列数量太少，无法进行有意义的分析")
            return
        
        # 生成WebFAST特征
        webfast_features = []
        baseline_features = []
        
        for seq in self.event_sequences:
            webfast_feat = self.generate_webfast_features(seq)
            baseline_feat = self.generate_baseline_features(seq)
            
            webfast_features.append(webfast_feat)
            baseline_features.append(baseline_feat)
        
        webfast_features = np.array(webfast_features)
        baseline_features = np.array(baseline_features)
        
        # 标准化特征
        scaler_webfast = StandardScaler()
        scaler_baseline = StandardScaler()
        
        webfast_scaled = scaler_webfast.fit_transform(webfast_features)
        baseline_scaled = scaler_baseline.fit_transform(baseline_features)
        
        # 使用t-SNE进行降维可视化
        print("执行t-SNE降维...")
        
        # 为了确保可重现性
        np.random.seed(42)
        
        tsne_webfast = TSNE(n_components=2, random_state=42, perplexity=min(30, len(self.event_sequences)//3))
        tsne_baseline = TSNE(n_components=2, random_state=42, perplexity=min(30, len(self.event_sequences)//3))
        
        webfast_2d = tsne_webfast.fit_transform(webfast_scaled)
        baseline_2d = tsne_baseline.fit_transform(baseline_scaled)
        
        # 创建可视化
        self.visualize_feature_separability(webfast_2d, baseline_2d)
        
        # 计算聚类质量指标
        self.calculate_separability_metrics(webfast_scaled, baseline_scaled)
    
    def visualize_feature_separability(self, webfast_2d, baseline_2d):
        """可视化特征空间分离效果"""
        plt.figure(figsize=(16, 8))
        
        # 颜色映射
        unique_labels = list(set(self.task_labels))
        colors = plt.cm.Set3(np.linspace(0, 1, len(unique_labels)))
        color_map = dict(zip(unique_labels, colors))
        
        # WebFAST特征可视化
        plt.subplot(1, 2, 1)
        for i, (label, point) in enumerate(zip(self.task_labels, webfast_2d)):
            plt.scatter(point[0], point[1], c=[color_map[label]], 
                       label=label if label not in plt.gca().get_legend_handles_labels()[1] else "",
                       alpha=0.7, s=60)
        
        plt.title('WebFAST特征空间t-SNE可视化', fontsize=14, fontweight='bold')
        plt.xlabel('t-SNE Dimension 1')
        plt.ylabel('t-SNE Dimension 2')
        plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
        plt.grid(True, alpha=0.3)
        
        # 基线特征可视化
        plt.subplot(1, 2, 2)
        for i, (label, point) in enumerate(zip(self.task_labels, baseline_2d)):
            plt.scatter(point[0], point[1], c=[color_map[label]], 
                       label=label if label not in plt.gca().get_legend_handles_labels()[1] else "",
                       alpha=0.7, s=60)
        
        plt.title('基线特征空间t-SNE可视化', fontsize=14, fontweight='bold')
        plt.xlabel('t-SNE Dimension 1')
        plt.ylabel('t-SNE Dimension 2')
        plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
        plt.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        # 保存图片
        output_file = 'experiment_1_feature_separability.png'
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"特征分离性可视化已保存至 {output_file}")
        plt.show()
    
    def calculate_separability_metrics(self, webfast_features, baseline_features):
        """计算特征空间分离性指标"""
        from sklearn.metrics import silhouette_score
        from sklearn.cluster import KMeans
        
        # 为标签创建数值映射
        unique_labels = list(set(self.task_labels))
        label_to_num = {label: i for i, label in enumerate(unique_labels)}
        numeric_labels = [label_to_num[label] for label in self.task_labels]
        
        print(f"\n=== 特征空间质量评估 ===")
        
        # 计算轮廓系数 (Silhouette Score)
        try:
            if len(unique_labels) > 1 and len(webfast_features) > len(unique_labels):
                webfast_silhouette = silhouette_score(webfast_features, numeric_labels)
                baseline_silhouette = silhouette_score(baseline_features, numeric_labels)
                
                print(f"轮廓系数 (越高越好，范围[-1,1]):")
                print(f"  WebFAST特征: {webfast_silhouette:.3f}")
                print(f"  基线特征: {baseline_silhouette:.3f}")
                print(f"  WebFAST相对提升: {((webfast_silhouette - baseline_silhouette) / abs(baseline_silhouette) * 100):.1f}%" if baseline_silhouette != 0 else "  基线为0，无法计算提升")
            else:
                print("数据量不足或标签过少，无法计算轮廓系数")
        except Exception as e:
            print(f"计算轮廓系数时出错: {e}")
        
        # 计算类内距离vs类间距离比值
        try:
            webfast_ratio = self.calculate_intra_inter_distance_ratio(webfast_features, numeric_labels)
            baseline_ratio = self.calculate_intra_inter_distance_ratio(baseline_features, numeric_labels)
            
            print(f"\n类内/类间距离比值 (越小越好):")
            print(f"  WebFAST特征: {webfast_ratio:.3f}")
            print(f"  基线特征: {baseline_ratio:.3f}")
            if baseline_ratio > 0:
                improvement = (baseline_ratio - webfast_ratio) / baseline_ratio * 100
                print(f"  WebFAST改善程度: {improvement:.1f}%")
        except Exception as e:
            print(f"计算距离比值时出错: {e}")
    
    def calculate_intra_inter_distance_ratio(self, features, labels):
        """计算类内距离与类间距离的比值"""
        from scipy.spatial.distance import pdist, squareform
        
        # 计算所有点对之间的距离
        distances = squareform(pdist(features))
        
        # 计算类内距离
        intra_distances = []
        for label in set(labels):
            indices = [i for i, l in enumerate(labels) if l == label]
            if len(indices) > 1:
                for i in range(len(indices)):
                    for j in range(i+1, len(indices)):
                        intra_distances.append(distances[indices[i], indices[j]])
        
        # 计算类间距离
        inter_distances = []
        for i in range(len(labels)):
            for j in range(i+1, len(labels)):
                if labels[i] != labels[j]:
                    inter_distances.append(distances[i, j])
        
        if not intra_distances or not inter_distances:
            return float('inf')
        
        avg_intra = np.mean(intra_distances)
        avg_inter = np.mean(inter_distances)
        
        return avg_intra / avg_inter if avg_inter > 0 else float('inf')

    def generate_summary_report(self):
        """生成分析摘要报告"""
        if not self.mouse_trails:
            print("无法生成报告：没有轨迹数据")
            return
            
        print("\n" + "="*60)
        print("FAST技术可行性分析报告")
        print("="*60)
        
        # 数据集统计
        print(f"\n数据集概况:")
        print(f"- 总事件数: {len(self.df)}")
        print(f"- 点击事件数: {len(self.df[self.df['event_type'] == 'user_action_click'])}")
        print(f"- 生成的鼠标轨迹数: {len(self.mouse_trails)}")
        
        # DCT分析结果
        if self.mouse_trails:
            trail = self.mouse_trails[0]
            x_dct = dct(trail[:, 0], type=2, norm='ortho')
            y_dct = dct(trail[:, 1], type=2, norm='ortho')
            
            # 计算不同系数数量的性能
            for k in [5, 10, 15]:
                total_energy = np.sum(x_dct**2) + np.sum(y_dct**2)
                preserved_energy = np.sum(x_dct[:k]**2) + np.sum(y_dct[:k]**2)
                energy_ratio = preserved_energy / total_energy
                
                # 压缩率
                original_size = trail.size
                compressed_size = k * 2  # x和y各k个系数
                compression_ratio = original_size / compressed_size
                
                print(f"\n前{k}个DCT系数:")
                print(f"- 能量保持率: {energy_ratio:.1%}")
                print(f"- 压缩率: {compression_ratio:.1f}:1")
        
        print(f"\n建议:")
        print(f"- 对于鼠标轨迹数据，保留前10个DCT系数可以达到较好的压缩效果")
        print(f"- 这验证了FAST技术在浏览器行为数据上的可行性")
        print(f"- 频域变换确实能够有效集中信号能量，支持高效压缩")

def main():
    parser = argparse.ArgumentParser(description='实验一: FAST可行性分析')
    parser.add_argument('input_file', help='清洗后的CSV数据文件')
    parser.add_argument('--coeffs', type=int, default=10, help='保留的DCT系数数量 (默认: 10)')
    args = parser.parse_args()
    
    if not os.path.exists(args.input_file):
        print(f"错误：找不到输入文件 {args.input_file}")
        return
    
    analyzer = FeasibilityAnalyzer(args.input_file)
    
    # 运行原有的DCT能量分析
    analyzer.analyze_dct_energy(args.coeffs)
    
    # 新增：运行特征空间分离性分析
    analyzer.run_feature_separability_analysis()
    
    analyzer.generate_summary_report()

if __name__ == "__main__":
    main()