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
        event_type = event['type']
        if event_type.startswith('user.') or event_type.startswith('ui.'):
            user_features = self._extract_user_action_features(event)
            base_features.update(user_features)
        elif event_type.startswith('browser.'):
            browser_features = self._extract_browser_action_features(event)
            base_features.update(browser_features)
            
        return base_features
    
    def _extract_user_action_features(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """提取用户行为特征"""
        payload = event.get('payload', {})
        features = payload.get('features', {})
        
        # 增加对modifier_keys的处理
        modifier_keys = payload.get('modifier_keys', [])
        
        # Extract action subtype from new event format
        event_type = event['type']
        if event_type.startswith('user.'):
            action_subtype = event_type.replace('user.', '')
        elif event_type.startswith('ui.'):
            action_subtype = event_type.replace('ui.', '')
        else:
            action_subtype = event_type
        
        base_features = {
            'action_subtype': action_subtype,
            'element_role': features.get('element_role'),
            'element_text': str(features.get('element_text', ''))[:100],
            'is_nav_link': features.get('is_nav_link'),
            'is_input_field': features.get('is_input_field'),
            'page_type': features.get('page_type'),
            'path_depth': features.get('path_depth'),
            'x_coord': payload.get('x'),
            'y_coord': payload.get('y'),
            'selector': str(payload.get('selector', ''))[:200],
            # --- 新增特征 ---
            'is_ctrl_key': 'ctrl' in modifier_keys,
            'is_shift_key': 'shift' in modifier_keys,
            'is_alt_key': 'alt' in modifier_keys,
            'key_char': payload.get('key') if event_type == 'user.keydown' else None,
            'input_duration': payload.get('duration') if event_type == 'user.text_input' else None,
            'input_method': payload.get('input_method') if event_type == 'user.text_input' else None
        }
        
        # 特定事件类型的额外特征提取
        event_type = event.get('type', '')
        
        if event_type == 'ui.mouse_pattern':
            # 鼠标模式特征
            trail = payload.get('trail', [])
            base_features.update({
                'mouse_pattern_type': features.get('pattern_type'),
                'mouse_movement_speed': features.get('movement_speed'),
                'mouse_direction_changes': features.get('direction_changes'),
                'mouse_total_distance': features.get('total_distance'),
                'mouse_trail_length': len(trail),
                'mouse_significance': features.get('significance')
            })
            
        elif event_type == 'user.scroll':
            # 滚动特征
            base_features.update({
                'scroll_direction': features.get('scroll_direction'),
                'scroll_position': features.get('scroll_position'),
                'scroll_percentage': features.get('scroll_percentage'),
                'page_height': features.get('page_height'),
                'viewport_height': features.get('viewport_height')
            })
            
        elif event_type == 'user.form_submit':
            # 表单提交特征
            base_features.update({
                'form_selector': payload.get('form_selector'),
                'field_count': payload.get('field_count'),
                'has_required_fields': payload.get('has_required_fields'),
                'submit_method': payload.get('submit_method')
            })
            
        elif event_type == 'ui.focus_change':
            # 焦点变化特征
            base_features.update({
                'focus_type': payload.get('focus_type'),
                'from_selector': payload.get('from_selector'),
                'to_selector': payload.get('to_selector')
            })
            
        elif event_type == 'browser.page_visibility':
            # 页面可见性特征
            base_features.update({
                'visibility_state': payload.get('visibility_state'),
                'previous_state': payload.get('previous_state'),
                'time_on_page': features.get('time_on_page')
            })
            
        elif event_type == 'ui.mouse_hover':
            # 鼠标悬停特征
            base_features.update({
                'hover_duration': payload.get('hover_duration')
            })
            
        elif event_type == 'user.clipboard':
            # 剪贴板特征
            base_features.update({
                'clipboard_operation': payload.get('operation'),
                'text_length': payload.get('text_length'),
                'has_formatting': payload.get('has_formatting')
            })
        
        return base_features
    
    def _extract_browser_action_features(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """提取浏览器行为特征"""
        # Extract action subtype from new browser event format
        event_type = event['type']
        action_subtype = event_type.replace('browser.', '') if event_type.startswith('browser.') else event_type
        
        return {
            'action_subtype': action_subtype,
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
            } if 'datetime' in df.columns else None,
            # 特定事件类型统计
            'mouse_pattern_stats': {
                'total_mouse_patterns': len(df[df['event_type'] == 'ui.mouse_pattern']),
                'pattern_types': df[df['mouse_pattern_type'].notna()]['mouse_pattern_type'].value_counts().to_dict() if 'mouse_pattern_type' in df.columns else {}
            },
            'scroll_stats': {
                'total_scrolls': len(df[df['event_type'] == 'user.scroll']),
                'scroll_directions': df[df['scroll_direction'].notna()]['scroll_direction'].value_counts().to_dict() if 'scroll_direction' in df.columns else {}
            },
            'form_submit_stats': {
                'total_form_submits': len(df[df['event_type'] == 'user.form_submit'])
            },
            'clipboard_stats': {
                'total_clipboard_actions': len(df[df['event_type'] == 'user.clipboard']),
                'clipboard_operations': df[df['clipboard_operation'].notna()]['clipboard_operation'].value_counts().to_dict() if 'clipboard_operation' in df.columns else {}
            }
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