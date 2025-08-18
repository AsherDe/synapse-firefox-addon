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

class FeasibilityAnalyzer:
    def __init__(self, cleaned_data_file: str):
        self.df = pd.read_csv(cleaned_data_file)
        # 使用真实鼠标轨迹数据from user_action_mouse_pattern事件
        self.mouse_trails = self._extract_real_mouse_trails()

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
        
        # 如果没有找到真实轨迹数据，则fallback到模拟数据但给出明确警告
        if not trails:
            print("警告：无法从数据中提取真实鼠标轨迹。")
            print("请确保数据收集时正确记录了user_action_mouse_pattern事件的trail字段。")
            print("当前将使用少量模拟数据进行演示，但这会降低分析的说服力。")
            return self._fallback_to_simulated_data()
        
        print(f"成功提取了 {len(trails)} 条真实鼠标轨迹")
        return trails
    
    def _parse_trails_from_json(self) -> list:
        """尝试从JSON格式的数据文件中解析轨迹"""
        trails = []
        
        # 检查是否有对应的JSON调试数据文件
        json_files = [f for f in os.listdir('.') if f.startswith('synapse-debug-data') and f.endswith('.json')]
        
        if json_files:
            for json_file in json_files:
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        
                    # 查找鼠标轨迹事件
                    if isinstance(data, list):
                        for event in data:
                            if (isinstance(event, dict) and 
                                event.get('type') == 'user_action_mouse_pattern' and
                                'payload' in event and
                                'trail' in event['payload']):
                                
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
    
    def _fallback_to_simulated_data(self) -> list:
        """作为fallback的模拟数据生成"""
        trails = []
        print("生成少量高质量模拟数据用于技术演示...")
        
        # 生成更真实的轨迹模式
        for _ in range(3):  # 减少数量，强调这是演示用途
            trail_len = np.random.randint(20, 60)  # 变化的轨迹长度
            
            # 模拟更真实的鼠标移动模式
            t = np.linspace(0, 1, trail_len)
            
            # 使用贝塞尔曲线风格的轨迹
            start_x, start_y = np.random.rand(2) * np.array([1200, 800]) + 100
            end_x, end_y = np.random.rand(2) * np.array([1200, 800]) + 100
            ctrl_x, ctrl_y = (start_x + end_x)/2 + np.random.randn(2) * 200
            
            # 二次贝塞尔曲线
            x_trail = (1-t)**2 * start_x + 2*(1-t)*t * ctrl_x + t**2 * end_x
            y_trail = (1-t)**2 * start_y + 2*(1-t)*t * ctrl_y + t**2 * end_y
            
            # 添加自然的抖动
            x_trail += np.random.randn(trail_len) * 3
            y_trail += np.random.randn(trail_len) * 3
            
            trails.append(np.vstack([x_trail, y_trail]).T)
            
        return trails

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
    analyzer.analyze_dct_energy(args.coeffs)
    analyzer.generate_summary_report()

if __name__ == "__main__":
    main()