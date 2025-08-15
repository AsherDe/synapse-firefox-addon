#!/usr/bin/env python3
"""
Synapse Debug Data Cleaning Script
清洗 Synapse 导出的调试数据，便于统计分析和机器学习
"""

import json
import pandas as pd
from datetime import datetime
from typing import Dict, Any, Optional
import argparse

class SynapseDataCleaner:
    def __init__(self, input_file: str):
        self.input_file = input_file
        self.data = None
        self.cleaned_events = []
        
    def load_data(self):
        """加载JSON数据"""
        with open(self.input_file, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
    
    def extract_event_features(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """提取事件的核心特征"""
        base_features = {
            'event_type': event.get('type'),
            'timestamp': event.get('timestamp'),
            'tab_id': event.get('context', {}).get('tabId'),
            'window_id': event.get('context', {}).get('windowId'),
            'url': event.get('payload', {}).get('url', ''),
            'domain': event.get('payload', {}).get('features', {}).get('domain', ''),
        }
        
        # 根据事件类型提取特定特征
        if event['type'].startswith('user_action_'):
            user_features = self._extract_user_action_features(event)
            base_features.update(user_features)
        elif event['type'].startswith('browser_action_'):
            browser_features = self._extract_browser_action_features(event)
            base_features.update(browser_features)
            
        return base_features
    
    def _extract_user_action_features(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """提取用户行为特征"""
        payload = event.get('payload', {})
        features = payload.get('features', {})
        
        return {
            'action_subtype': event['type'].replace('user_action_', ''),
            'element_role': features.get('element_role'),
            'element_text': features.get('element_text', '')[:100],  # 限制长度
            'is_nav_link': features.get('is_nav_link'),
            'is_input_field': features.get('is_input_field'),
            'page_type': features.get('page_type'),
            'path_depth': features.get('path_depth'),
            'x_coord': payload.get('x'),
            'y_coord': payload.get('y'),
            'selector': payload.get('selector', '')[:200],  # 限制长度
        }
    
    def _extract_browser_action_features(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """提取浏览器行为特征"""
        return {
            'action_subtype': event['type'].replace('browser_action_', ''),
            'element_role': None,
            'element_text': None,
            'is_nav_link': None,
            'is_input_field': None,
            'page_type': None,
            'path_depth': None,
            'x_coord': None,
            'y_coord': None,
            'selector': None,
        }
    
    def clean_events(self):
        """清洗事件数据"""
        if not self.data or 'eventSequence' not in self.data:
            raise ValueError("无效的数据格式")
        
        for event in self.data['eventSequence']:
            try:
                cleaned_event = self.extract_event_features(event)
                # 转换时间戳为可读格式
                if cleaned_event['timestamp']:
                    cleaned_event['datetime'] = datetime.fromtimestamp(
                        cleaned_event['timestamp'] / 1000
                    ).isoformat()
                self.cleaned_events.append(cleaned_event)
            except Exception as e:
                print(f"处理事件时出错: {e}")
                continue
    
    def get_statistics(self) -> Dict[str, Any]:
        """生成数据统计"""
        if not self.cleaned_events:
            return {}
        
        df = pd.DataFrame(self.cleaned_events)
        
        stats = {
            'total_events': len(df),
            'export_info': self.data.get('exportInfo', {}) if self.data else {},
            'event_type_counts': df['event_type'].value_counts().to_dict(),
            'action_subtype_counts': df['action_subtype'].value_counts().to_dict(),
            'domain_counts': df[df['domain'].notna()]['domain'].value_counts().head(10).to_dict(),
            'page_type_counts': df[df['page_type'].notna()]['page_type'].value_counts().to_dict(),
            'time_range': {
                'start': df['datetime'].min(),
                'end': df['datetime'].max()
            } if 'datetime' in df.columns else None
        }
        
        return stats
    
    def save_cleaned_data(self, output_file: str):
        """保存清洗后的数据"""
        df = pd.DataFrame(self.cleaned_events)
        
        if output_file.endswith('.csv'):
            df.to_csv(output_file, index=False, encoding='utf-8')
        elif output_file.endswith('.json'):
            df.to_json(output_file, orient='records', indent=2)
        elif output_file.endswith('.parquet'):
            df.to_parquet(output_file, index=False)
        else:
            raise ValueError("支持的输出格式: .csv, .json, .parquet")
    
    def save_statistics(self, stats_file: str):
        """保存统计信息"""
        stats = self.get_statistics()
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump(stats, f, ensure_ascii=False, indent=2, default=str)

def main():
    parser = argparse.ArgumentParser(description='清洗 Synapse 调试数据')
    parser.add_argument('input_file', help='输入的JSON文件路径')
    parser.add_argument('--output', '-o', default='cleaned_data.csv', help='输出文件路径')
    parser.add_argument('--stats', '-s', default='data_stats.json', help='统计信息输出文件')
    parser.add_argument('--format', '-f', choices=['csv', 'json', 'parquet'], 
                       default='csv', help='输出格式')
    
    args = parser.parse_args()
    
    # 根据格式调整输出文件扩展名
    if not args.output.endswith(f'.{args.format}'):
        base_name = args.output.rsplit('.', 1)[0] if '.' in args.output else args.output
        args.output = f"{base_name}.{args.format}"
    
    try:
        cleaner = SynapseDataCleaner(args.input_file)
        print(f"加载数据: {args.input_file}")
        cleaner.load_data()
        
        print("清洗事件数据...")
        cleaner.clean_events()
        
        print(f"保存清洗后数据到: {args.output}")
        cleaner.save_cleaned_data(args.output)
        
        print(f"保存统计信息到: {args.stats}")
        cleaner.save_statistics(args.stats)
        
        # 打印基本统计
        stats = cleaner.get_statistics()
        print(f"\n数据统计:")
        print(f"总事件数: {stats.get('total_events', 0)}")
        print(f"事件类型分布: {stats.get('event_type_counts', {})}")
        
        print("\n清洗完成!")
        
    except Exception as e:
        print(f"错误: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())