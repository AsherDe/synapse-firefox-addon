#!/usr/bin/env python3
"""
Synapse Experiment 4: Cross-Tab Workflow Pattern Analysis

Analyze cross-tab workflow patterns and clipboard enhancement effectiveness
- Detect cross-tab workflow sequences
- Analyze clipboard context usage
- Measure workflow automation potential
- Evaluate task guidance effectiveness
"""

import pandas as pd
import numpy as np
from collections import Counter, defaultdict
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import seaborn as sns
import argparse
import json
from typing import List, Dict, Tuple, Any

class WorkflowAnalysisExperiment:
    def __init__(self, cleaned_data_file: str):
        self.df = pd.read_csv(cleaned_data_file)
        self.workflow_patterns = []
        self.clipboard_sessions = []
        self.results = {}
        self.prepare_data()
    
    def prepare_data(self):
        """Prepare data for workflow analysis"""
        print("Preparing workflow analysis data...")
        
        # Convert timestamp to datetime
        self.df['datetime'] = pd.to_datetime(self.df['timestamp'], unit='ms')
        
        # Sort by timestamp
        self.df = self.df.sort_values('datetime')
        
        # Filter relevant events
        self.workflow_events = self.df[
            (self.df['event_type'].str.startswith('ui.')) |
            (self.df['event_type'].str.startswith('browser.tab.')) |
            (self.df['event_type'] == 'ui.clipboard')
        ].copy()
        
        print(f"Total events: {len(self.df)}")
        print(f"Workflow-relevant events: {len(self.workflow_events)}")
    
    def detect_cross_tab_workflows(self, min_length=3, max_gap_seconds=30):
        """Detect cross-tab workflow patterns"""
        print(f"Detecting cross-tab workflows (min_length={min_length}, max_gap={max_gap_seconds}s)...")
        
        # Group events by time windows
        workflows = []
        current_sequence = []
        last_timestamp = None
        tab_switches = 0
        
        for _, event in self.workflow_events.iterrows():
            current_time = event['datetime']
            
            # Check if this continues the current sequence
            if (last_timestamp is None or 
                (current_time - last_timestamp).total_seconds() <= max_gap_seconds):
                
                current_sequence.append({
                    'event_type': event['event_type'],
                    'tab_id': event['tab_id'],
                    'action_subtype': event['action_subtype'],
                    'selector': event.get('selector', ''),
                    'timestamp': event['timestamp'],
                    'parent_tab_id': event.get('parent_tab_id'),
                    'is_new_tab_event': event.get('is_new_tab_event', False)
                })
                
                # Count tab switches
                if len(current_sequence) > 1:
                    if current_sequence[-1]['tab_id'] != current_sequence[-2]['tab_id']:
                        tab_switches += 1
            else:
                # End current sequence, start new one
                if len(current_sequence) >= min_length and tab_switches > 0:
                    workflows.append({
                        'sequence': current_sequence,
                        'length': len(current_sequence),
                        'tab_switches': tab_switches,
                        'duration': (current_sequence[-1]['timestamp'] - current_sequence[0]['timestamp']) / 1000,
                        'unique_tabs': len(set(s['tab_id'] for s in current_sequence if s['tab_id']))
                    })
                
                current_sequence = [{
                    'event_type': event['event_type'],
                    'tab_id': event['tab_id'],
                    'action_subtype': event['action_subtype'],
                    'selector': event.get('selector', ''),
                    'timestamp': event['timestamp'],
                    'parent_tab_id': event.get('parent_tab_id'),
                    'is_new_tab_event': event.get('is_new_tab_event', False)
                }]
                tab_switches = 0
            
            last_timestamp = current_time
        
        # Don't forget the last sequence
        if len(current_sequence) >= min_length and tab_switches > 0:
            workflows.append({
                'sequence': current_sequence,
                'length': len(current_sequence),
                'tab_switches': tab_switches,
                'duration': (current_sequence[-1]['timestamp'] - current_sequence[0]['timestamp']) / 1000,
                'unique_tabs': len(set(s['tab_id'] for s in current_sequence if s['tab_id']))
            })
        
        self.workflow_patterns = workflows
        print(f"Detected {len(workflows)} cross-tab workflow patterns")
        return workflows
    
    def analyze_clipboard_enhancement(self):
        """Analyze clipboard enhancement effectiveness"""
        print("Analyzing clipboard enhancement patterns...")
        
        # Filter clipboard events
        clipboard_events = self.df[self.df['event_type'] == 'ui.clipboard'].copy()
        
        if len(clipboard_events) == 0:
            print("No clipboard events found")
            return {}
        
        # Analyze clipboard operations
        clipboard_stats = {
            'total_operations': len(clipboard_events),
            'copy_operations': len(clipboard_events[clipboard_events['clipboard_operation'] == 'copy']),
            'paste_operations': len(clipboard_events[clipboard_events['clipboard_operation'] == 'paste']),
            'cut_operations': len(clipboard_events[clipboard_events['clipboard_operation'] == 'cut'])
        }
        
        # Analyze cross-domain clipboard usage
        copy_events = clipboard_events[clipboard_events['clipboard_operation'] == 'copy']
        if len(copy_events) > 0:
            unique_source_domains = copy_events['domain'].nunique()
            clipboard_stats['cross_domain_copies'] = unique_source_domains
            
            # Analyze text length distribution
            text_lengths = copy_events['clipboard_text_length'].dropna()
            if len(text_lengths) > 0:
                clipboard_stats.update({
                    'avg_text_length': text_lengths.mean(),
                    'median_text_length': text_lengths.median(),
                    'max_text_length': text_lengths.max()
                })
        
        # Analyze clipboard context chains (copy -> paste patterns)
        clipboard_chains = self.detect_clipboard_chains(clipboard_events)
        clipboard_stats['clipboard_chains'] = len(clipboard_chains)
        clipboard_stats['avg_chain_duration'] = np.mean([c['duration'] for c in clipboard_chains]) if clipboard_chains else 0
        
        self.clipboard_analysis = clipboard_stats
        return clipboard_stats
    
    def detect_clipboard_chains(self, clipboard_events, max_gap_minutes=10):
        """Detect copy->paste chains"""
        chains = []
        copy_events = clipboard_events[clipboard_events['clipboard_operation'] == 'copy']
        paste_events = clipboard_events[clipboard_events['clipboard_operation'] == 'paste']
        
        for _, copy_event in copy_events.iterrows():
            copy_time = copy_event['datetime']
            
            # Find paste events within time window
            relevant_pastes = paste_events[
                (paste_events['datetime'] > copy_time) &
                (paste_events['datetime'] <= copy_time + timedelta(minutes=max_gap_minutes))
            ]
            
            for _, paste_event in relevant_pastes.iterrows():
                duration = (paste_event['datetime'] - copy_time).total_seconds()
                
                chains.append({
                    'copy_time': copy_time,
                    'paste_time': paste_event['datetime'],
                    'duration': duration,
                    'copy_domain': copy_event.get('domain', ''),
                    'paste_domain': paste_event.get('domain', ''),
                    'cross_domain': copy_event.get('domain') != paste_event.get('domain'),
                    'text_length': copy_event.get('clipboard_text_length', 0)
                })
        
        return chains
    
    def analyze_workflow_efficiency(self):
        """Analyze potential workflow automation efficiency gains"""
        print("Analyzing workflow automation potential...")
        
        if not self.workflow_patterns:
            return {}
        
        # Calculate workflow statistics
        workflow_lengths = [w['length'] for w in self.workflow_patterns]
        workflow_durations = [w['duration'] for w in self.workflow_patterns]
        tab_switches = [w['tab_switches'] for w in self.workflow_patterns]
        
        efficiency_analysis = {
            'total_workflows': len(self.workflow_patterns),
            'avg_workflow_length': np.mean(workflow_lengths),
            'avg_workflow_duration': np.mean(workflow_durations),
            'avg_tab_switches': np.mean(tab_switches),
            'automation_potential_events': sum(workflow_lengths) - len(self.workflow_patterns),  # Events that could be automated
            'time_saving_potential': sum(workflow_durations) * 0.7  # Assuming 70% time reduction through automation
        }
        
        # Analyze repeated patterns
        pattern_signatures = []
        for workflow in self.workflow_patterns:
            signature = '->'.join([s['action_subtype'] for s in workflow['sequence']])
            pattern_signatures.append(signature)
        
        pattern_frequency = Counter(pattern_signatures)
        repeated_patterns = {k: v for k, v in pattern_frequency.items() if v > 1}
        
        efficiency_analysis.update({
            'unique_patterns': len(pattern_frequency),
            'repeated_patterns': len(repeated_patterns),
            'most_common_pattern': pattern_frequency.most_common(1)[0] if pattern_frequency else None,
            'repeatability_score': len(repeated_patterns) / len(pattern_frequency) if pattern_frequency else 0
        })
        
        return efficiency_analysis
    
    def run_analysis(self):
        """Run complete workflow analysis"""
        print("="*60)
        print("SYNAPSE WORKFLOW PATTERN ANALYSIS")
        print("="*60)
        
        # 1. Detect cross-tab workflows
        workflows = self.detect_cross_tab_workflows()
        
        # 2. Analyze clipboard enhancement
        clipboard_stats = self.analyze_clipboard_enhancement()
        
        # 2.5. 新增：高阶模式发现
        print("\n3. 运行高阶模式发现算法...")
        discovered_patterns = self.discover_high_order_patterns()
        top_patterns = self.print_discovered_patterns_report()
        
        # 3. Analyze workflow efficiency
        efficiency_stats = self.analyze_workflow_efficiency()
        
        # 4. Store results
        self.results = {
            'workflow_patterns': len(workflows),
            'clipboard_enhancement': clipboard_stats,
            'efficiency_analysis': efficiency_stats,
            'high_order_patterns': {
                'total_discovered': len(self.discovered_patterns),
                'semantic_patterns': self.semantic_patterns[:5],  # Top 5
                'discovery_algorithm': 'FAST-inspired cross-tab pattern mining'
            },
            'analysis_timestamp': datetime.now().isoformat()
        }
        
        # 5. Print summary
        self.print_analysis_summary()
        
        return self.results
    
    def print_analysis_summary(self):
        """Print analysis summary"""
        print("\n" + "="*50)
        print("ANALYSIS SUMMARY")
        print("="*50)
        
        # Workflow patterns summary
        print(f"\n📊 CROSS-TAB WORKFLOW PATTERNS:")
        print(f"   • Total detected patterns: {len(self.workflow_patterns)}")
        if self.workflow_patterns:
            avg_length = np.mean([w['length'] for w in self.workflow_patterns])
            avg_tabs = np.mean([w['unique_tabs'] for w in self.workflow_patterns])
            print(f"   • Average pattern length: {avg_length:.1f} events")
            print(f"   • Average tabs involved: {avg_tabs:.1f}")
        
        # Clipboard enhancement summary
        if 'clipboard_enhancement' in self.results and self.results['clipboard_enhancement']:
            stats = self.results['clipboard_enhancement']
            print(f"\n📋 CLIPBOARD ENHANCEMENT:")
            print(f"   • Total clipboard operations: {stats.get('total_operations', 0)}")
            print(f"   • Copy operations: {stats.get('copy_operations', 0)}")
            print(f"   • Paste operations: {stats.get('paste_operations', 0)}")
            print(f"   • Cross-domain usage: {stats.get('cross_domain_copies', 0)} domains")
            if 'clipboard_chains' in stats:
                print(f"   • Copy->paste chains: {stats['clipboard_chains']}")
        
        # Efficiency analysis summary
        if 'efficiency_analysis' in self.results and self.results['efficiency_analysis']:
            eff = self.results['efficiency_analysis']
            print(f"\n⚡ AUTOMATION POTENTIAL:")
            print(f"   • Events automatable: {eff.get('automation_potential_events', 0)}")
            print(f"   • Time saving potential: {eff.get('time_saving_potential', 0):.1f}s")
            print(f"   • Pattern repeatability: {eff.get('repeatability_score', 0):.1%}")
        
        # 高阶模式发现摘要
        if 'high_order_patterns' in self.results and self.results['high_order_patterns']:
            hop = self.results['high_order_patterns']
            print(f"\n🔍 高阶模式发现:")
            print(f"   • 发现的复杂模式: {hop.get('total_discovered', 0)}个")
            
            semantic_patterns = hop.get('semantic_patterns', [])
            if semantic_patterns:
                print(f"   • 最频繁的模式: {semantic_patterns[0]['description']}")
                print(f"     频率: {semantic_patterns[0]['frequency']}次")
                print(f"     复杂度: {semantic_patterns[0]['complexity']}")
            print(f"   • 使用算法: {hop.get('discovery_algorithm', 'Unknown')}")
    
    def save_results(self, output_file=None):
        """Save analysis results to JSON"""
        if output_file is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f'workflow_analysis_results_{timestamp}.json'
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(self.results, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Results saved to: {output_file}")
    
    def create_visualizations(self, output_dir='.'):
        """Create workflow analysis visualizations"""
        print("\n📈 Creating visualizations...")
        
        plt.style.use('default')
        fig, axes = plt.subplots(2, 2, figsize=(15, 12))
        fig.suptitle('Synapse 跨标签页工作流 & 高阶模式分析', fontsize=16, fontweight='bold')
        
        # 1. Workflow length distribution
        if self.workflow_patterns:
            lengths = [w['length'] for w in self.workflow_patterns]
            axes[0, 0].hist(lengths, bins=max(10, len(set(lengths))), alpha=0.7, color='skyblue')
            axes[0, 0].set_title('Workflow Pattern Length Distribution')
            axes[0, 0].set_xlabel('Number of Events')
            axes[0, 0].set_ylabel('Frequency')
            axes[0, 0].grid(True, alpha=0.3)
        else:
            axes[0, 0].text(0.5, 0.5, 'No workflow patterns detected', 
                           ha='center', va='center', transform=axes[0, 0].transAxes)
            axes[0, 0].set_title('Workflow Pattern Length Distribution')
        
        # 2. Tab switches per workflow
        if self.workflow_patterns:
            tab_switches = [w['tab_switches'] for w in self.workflow_patterns]
            axes[0, 1].hist(tab_switches, bins=max(5, len(set(tab_switches))), alpha=0.7, color='lightgreen')
            axes[0, 1].set_title('Tab Switches per Workflow')
            axes[0, 1].set_xlabel('Number of Tab Switches')
            axes[0, 1].set_ylabel('Frequency')
            axes[0, 1].grid(True, alpha=0.3)
        else:
            axes[0, 1].text(0.5, 0.5, 'No workflow patterns detected', 
                           ha='center', va='center', transform=axes[0, 1].transAxes)
            axes[0, 1].set_title('Tab Switches per Workflow')
        
        # 3. Clipboard operation types
        if hasattr(self, 'clipboard_analysis') and self.clipboard_analysis:
            operations = ['Copy', 'Paste', 'Cut']
            counts = [
                self.clipboard_analysis.get('copy_operations', 0),
                self.clipboard_analysis.get('paste_operations', 0),
                self.clipboard_analysis.get('cut_operations', 0)
            ]
            colors = ['#ff9999', '#66b3ff', '#99ff99']
            axes[1, 0].bar(operations, counts, color=colors, alpha=0.7)
            axes[1, 0].set_title('Clipboard Operations Distribution')
            axes[1, 0].set_ylabel('Count')
            axes[1, 0].grid(True, alpha=0.3, axis='y')
        else:
            axes[1, 0].text(0.5, 0.5, 'No clipboard data available', 
                           ha='center', va='center', transform=axes[1, 0].transAxes)
            axes[1, 0].set_title('Clipboard Operations Distribution')
        
        # 4. 高阶模式复杂度分布
        if self.semantic_patterns:
            complexities = [p['complexity'] for p in self.semantic_patterns]
            frequencies = [p['frequency'] for p in self.semantic_patterns]
            
            # 根据跨标签页数量着色
            colors = []
            for p in self.semantic_patterns:
                tab_count = p['tabs_involved']
                if tab_count >= 4:
                    colors.append('red')    # 高复杂度
                elif tab_count >= 3:
                    colors.append('orange') # 中等复杂度
                else:
                    colors.append('green')  # 低复杂度
            
            scatter = axes[1, 1].scatter(complexities, frequencies, 
                                       alpha=0.7, c=colors, s=80, edgecolors='black')
            axes[1, 1].set_title('高阶模式复杂度 vs 频率')
            axes[1, 1].set_xlabel('复杂度评分')
            axes[1, 1].set_ylabel('出现频率')
            axes[1, 1].grid(True, alpha=0.3)
            
            # 添加图例
            from matplotlib.patches import Patch
            legend_elements = [
                Patch(facecolor='green', label='简单模式 (2-2标签页)'),
                Patch(facecolor='orange', label='复杂模式 (3标签页)'),
                Patch(facecolor='red', label='高度复杂 (4+标签页)')
            ]
            axes[1, 1].legend(handles=legend_elements, loc='upper right')
            
            # 标注最高频模式
            if frequencies:
                max_freq_idx = np.argmax(frequencies)
                axes[1, 1].annotate(f'最频繁模式\n({frequencies[max_freq_idx]}次)', 
                                  xy=(complexities[max_freq_idx], frequencies[max_freq_idx]),
                                  xytext=(10, 10), textcoords='offset points',
                                  bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7),
                                  arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=0'))
        else:
            axes[1, 1].text(0.5, 0.5, 'No high-order patterns discovered', 
                           ha='center', va='center', transform=axes[1, 1].transAxes)
            axes[1, 1].set_title('高阶模式复杂度分布')
        
        plt.tight_layout()
        
        # Save the plot
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f'{output_dir}/workflow_analysis_{timestamp}.png'
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        plt.show()
        
        print(f"📊 Visualization saved to: {output_file}")

def main():
    parser = argparse.ArgumentParser(description='Analyze cross-tab workflow patterns and clipboard enhancement')
    parser.add_argument('cleaned_data_file', help='Path to cleaned CSV data file')
    parser.add_argument('--min-length', type=int, default=3, help='Minimum workflow length (default: 3)')
    parser.add_argument('--max-gap', type=int, default=30, help='Maximum gap between events in seconds (default: 30)')
    parser.add_argument('--save-results', action='store_true', help='Save results to JSON file')
    parser.add_argument('--skip-viz', action='store_true', help='Skip visualization generation')
    
    args = parser.parse_args()
    
    try:
        # Run the experiment
        experiment = WorkflowAnalysisExperiment(args.cleaned_data_file)
        results = experiment.run_analysis()
        
        # Save results if requested
        if args.save_results:
            experiment.save_results()
        
        # Create visualizations unless skipped
        if not args.skip_viz:
            experiment.create_visualizations()
        
        return results
        
    except Exception as e:
        print(f"Error running workflow analysis: {e}")
        return None

if __name__ == '__main__':
    main()