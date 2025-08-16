#!/usr/bin/env python3
"""
Synapse Complete Experiment Suite

自动运行所有三个实验的便捷脚本
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path

def run_command(cmd, description):
    """运行命令并处理输出"""
    print(f"\n{'='*60}")
    print(f"正在执行: {description}")
    print(f"命令: {' '.join(cmd)}")
    print('='*60)
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(result.stdout)
        if result.stderr:
            print(f"警告: {result.stderr}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"错误: 命令执行失败")
        print(f"返回码: {e.returncode}")
        print(f"错误输出: {e.stderr}")
        return False
    except FileNotFoundError:
        print(f"错误: 找不到命令 {cmd[0]}")
        print("请确保已安装所有必需的依赖")
        return False

def check_dependencies():
    """检查必需的Python包"""
    required_packages = [
        'pandas', 'numpy', 'matplotlib', 'scipy', 'seaborn', 'sklearn'
    ]
    
    missing_packages = []
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print("缺少以下Python包:")
        for package in missing_packages:
            print(f"  - {package}")
        print(f"\n安装命令: pip install {' '.join(missing_packages)}")
        return False
    
    return True

def main():
    parser = argparse.ArgumentParser(description='运行完整的Synapse实验套件')
    parser.add_argument('data_file', help='原始JSON数据文件路径')
    parser.add_argument('--skip-cleaning', action='store_true', 
                       help='跳过数据清洗（使用已有的cleaned_data.csv）')
    parser.add_argument('--skip-exp1', action='store_true', help='跳过实验一')
    parser.add_argument('--skip-exp2', action='store_true', help='跳过实验二')
    parser.add_argument('--skip-exp3', action='store_true', help='跳过实验三')
    parser.add_argument('--user-group', choices=['test', 'control'], 
                       help='用户组别（实验三需要）')
    parser.add_argument('--compare-file', help='对照组数据文件（实验三可选）')
    args = parser.parse_args()
    
    # 检查依赖
    print("检查Python依赖...")
    if not check_dependencies():
        print("请安装缺少的依赖后重试")
        return 1
    
    # 获取脚本目录
    script_dir = Path(__file__).parent
    
    # 检查输入文件
    if not os.path.exists(args.data_file):
        print(f"错误: 找不到数据文件 {args.data_file}")
        return 1
    
    # 步骤1: 数据清洗
    cleaned_file = script_dir / 'cleaned_data.csv'
    
    if not args.skip_cleaning or not cleaned_file.exists():
        print("\n开始数据清洗...")
        clean_cmd = [
            sys.executable, 
            str(script_dir / 'clean_debug_data.py'),
            args.data_file
        ]
        
        if not run_command(clean_cmd, "数据清洗"):
            print("数据清洗失败，终止实验")
            return 1
        
        print(f"数据清洗完成，输出文件: {cleaned_file}")
    else:
        print(f"使用现有清洗数据: {cleaned_file}")
    
    if not cleaned_file.exists():
        print("错误: 清洗后的数据文件不存在")
        return 1
    
    # 步骤2: 实验一 - 可行性分析
    if not args.skip_exp1:
        exp1_cmd = [
            sys.executable,
            str(script_dir / 'experiment_1_feasibility.py'),
            str(cleaned_file)
        ]
        
        if not run_command(exp1_cmd, "实验一: FAST可行性分析"):
            print("实验一执行失败")
    
    # 步骤3: 实验二 - 预测准确率
    if not args.skip_exp2:
        exp2_cmd = [
            sys.executable,
            str(script_dir / 'experiment_2_prediction.py'),
            str(cleaned_file)
        ]
        
        if not run_command(exp2_cmd, "实验二: 下一动作预测准确率"):
            print("实验二执行失败")
    
    # 步骤4: 实验三 - 用户研究
    if not args.skip_exp3:
        if not args.user_group:
            print("警告: 跳过实验三，因为未指定用户组别")
            print("使用 --user-group test 或 --user-group control 来指定")
        else:
            exp3_cmd = [
                sys.executable,
                str(script_dir / 'experiment_3_user_study.py'),
                str(cleaned_file),
                '--group', args.user_group
            ]
            
            if args.compare_file:
                exp3_cmd.extend(['--compare', args.compare_file])
            
            if not run_command(exp3_cmd, f"实验三: 用户研究分析 ({args.user_group}组)"):
                print("实验三执行失败")
    
    print("\n" + "="*60)
    print("实验套件执行完成！")
    print("="*60)
    print("\n生成的文件:")
    
    # 列出可能生成的文件
    output_files = [
        'cleaned_data.csv',
        'data_stats.json', 
        'experiment_1_dct_analysis.png',
        'experiment_2_prediction_results.png',
        f'experiment_3_user_behavior_{args.user_group}.png' if args.user_group else None
    ]
    
    for filename in output_files:
        if filename:
            filepath = script_dir / filename
            if filepath.exists():
                print(f"  ✓ {filename}")
            else:
                print(f"  ✗ {filename} (未生成)")
    
    print(f"\n所有输出文件位于: {script_dir}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())