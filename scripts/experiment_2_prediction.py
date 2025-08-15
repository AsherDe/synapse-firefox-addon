#!/usr/bin/env python3
"""
Synapse Experiment 2: Next Action Prediction Accuracy

- 实现基线模型 (频率模型, 马尔可夫模型)
- 训练一个简单的LSTM序列模型
- 对比不同模型的下一动作预测准确率
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from collections import Counter, defaultdict
import argparse
import os
import matplotlib.pyplot as plt
import seaborn as sns

# 可选的深度学习支持
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Embedding, LSTM, Dense, Dropout
    from tensorflow.keras.preprocessing.text import Tokenizer
    from tensorflow.keras.preprocessing.sequence import pad_sequences
    from tensorflow.keras.callbacks import EarlyStopping
    HAS_TENSORFLOW = True
except ImportError:
    print("警告: 未找到TensorFlow。LSTM模型将被跳过。")
    print("安装命令: pip install tensorflow")
    HAS_TENSORFLOW = False

class PredictionExperiment:
    def __init__(self, cleaned_data_file: str):
        self.df = pd.read_csv(cleaned_data_file)
        self.results = {}
        self.prepare_data()

    def prepare_data(self):
        """将事件序列转换为模型可用的格式"""
        print("准备数据...")
        
        # 清理数据
        self.df = self.df.dropna(subset=['action_subtype'])
        
        # 创建简化的token序列
        self.df['token'] = self.df['action_subtype'].astype(str)
        
        # 添加更多上下文信息到token中
        enhanced_tokens = []
        for _, row in self.df.iterrows():
            token = row['action_subtype']
            
            # 为点击事件添加元素角色信息
            if token == 'click' and pd.notna(row['element_role']):
                token = f"click_{row['element_role']}"
            
            # 为键盘事件添加修饰键信息
            elif token == 'keydown':
                if row['is_ctrl_key']:
                    token = "ctrl_key"
                elif row['is_shift_key']:
                    token = "shift_key"
                elif row['is_alt_key']:
                    token = "alt_key"
                else:
                    token = "regular_key"
            
            enhanced_tokens.append(token)
        
        self.df['enhanced_token'] = enhanced_tokens
        
        # 创建序列数据
        self.create_sequences()
        
        print(f"数据准备完成:")
        print(f"- 总事件数: {len(self.df)}")
        print(f"- 唯一token数: {len(self.df['enhanced_token'].unique())}")
        print(f"- 训练序列数: {len(self.X_train) if hasattr(self, 'X_train') else 0}")

    def create_sequences(self):
        """创建输入-输出序列对"""
        tokens = self.df['enhanced_token'].tolist()
        
        # 创建词汇表
        self.vocab = list(set(tokens))
        self.token_to_id = {token: i for i, token in enumerate(self.vocab)}
        self.id_to_token = {i: token for token, i in self.token_to_id.items()}
        
        # 转换为数字序列
        token_ids = [self.token_to_id[token] for token in tokens]
        
        # 创建滑动窗口序列
        seq_length = 5  # 使用前5个事件预测第6个
        X, y = [], []
        
        for i in range(len(token_ids) - seq_length):
            X.append(token_ids[i:i+seq_length])
            y.append(token_ids[i+seq_length])
        
        if len(X) == 0:
            print("错误：数据太少，无法创建序列")
            return
        
        X = np.array(X)
        y = np.array(y)
        
        # 分割训练和测试集
        if len(X) < 10:
            print("警告：数据量很小，结果可能不可靠")
            test_size = 0.3
        else:
            test_size = 0.2
            
        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, shuffle=False
        )

    def run_frequency_baseline(self):
        """运行频率基线模型"""
        print("\n--- 频率基线模型 ---")
        
        # 找到最常见的token
        most_common_id = Counter(self.y_train).most_common(1)[0][0]
        most_common_token = self.id_to_token[most_common_id]
        
        # 对所有测试样本预测最常见的token
        y_pred_freq = [most_common_id] * len(self.y_test)
        
        accuracy = accuracy_score(self.y_test, y_pred_freq)
        self.results['frequency'] = {
            'accuracy': accuracy,
            'model': f'总是预测: {most_common_token}'
        }
        
        print(f"最常见的动作: {most_common_token}")
        print(f"Top-1 准确率: {accuracy:.3f}")
        
        return accuracy

    def run_markov_baseline(self):
        """运行马尔可夫基线模型"""
        print("\n--- 马尔可夫基线模型 ---")
        
        # 构建转移概率矩阵
        transitions = defaultdict(Counter)
        
        for i in range(len(self.y_train)):
            prev_token = self.X_train[i][-1]  # 使用序列的最后一个token
            next_token = self.y_train[i]
            transitions[prev_token][next_token] += 1
        
        # 预测测试集
        y_pred_markov = []
        fallback_token = Counter(self.y_train).most_common(1)[0][0]
        
        for seq in self.X_test:
            prev_token = seq[-1]
            
            if prev_token in transitions and transitions[prev_token]:
                # 选择最可能的下一个token
                pred = transitions[prev_token].most_common(1)[0][0]
                y_pred_markov.append(pred)
            else:
                # 回退到最常见的token
                y_pred_markov.append(fallback_token)
        
        accuracy = accuracy_score(self.y_test, y_pred_markov)
        self.results['markov'] = {
            'accuracy': accuracy,
            'transitions': len(transitions)
        }
        
        print(f"学习到的转移模式数: {len(transitions)}")
        print(f"Top-1 准确率: {accuracy:.3f}")
        
        return accuracy

    def run_ngram_model(self, n=3):
        """运行N-gram模型"""
        print(f"\n--- {n}-gram模型 ---")
        
        # 构建n-gram统计
        ngram_counts = defaultdict(Counter)
        
        for i in range(len(self.y_train)):
            if len(self.X_train[i]) >= n-1:
                # 使用序列的最后n-1个token作为上下文
                context = tuple(self.X_train[i][-(n-1):])
                next_token = self.y_train[i]
                ngram_counts[context][next_token] += 1
        
        # 预测
        y_pred_ngram = []
        fallback_token = Counter(self.y_train).most_common(1)[0][0]
        
        for seq in self.X_test:
            if len(seq) >= n-1:
                context = tuple(seq[-(n-1):])
                
                if context in ngram_counts and ngram_counts[context]:
                    pred = ngram_counts[context].most_common(1)[0][0]
                    y_pred_ngram.append(pred)
                else:
                    y_pred_ngram.append(fallback_token)
            else:
                y_pred_ngram.append(fallback_token)
        
        accuracy = accuracy_score(self.y_test, y_pred_ngram)
        self.results[f'{n}gram'] = {
            'accuracy': accuracy,
            'patterns': len(ngram_counts)
        }
        
        print(f"学习到的{n}-gram模式数: {len(ngram_counts)}")
        print(f"Top-1 准确率: {accuracy:.3f}")
        
        return accuracy

    def run_lstm_model(self):
        """训练并评估LSTM模型"""
        if not HAS_TENSORFLOW:
            print("\n--- 跳过LSTM模型 (需要TensorFlow) ---")
            return 0
            
        print("\n--- LSTM模型 ---")
        
        vocab_size = len(self.vocab)
        seq_length = self.X_train.shape[1]
        
        # 构建模型
        model = Sequential([
            Embedding(input_dim=vocab_size, output_dim=32, input_length=seq_length),
            LSTM(64, return_sequences=True, dropout=0.2),
            LSTM(32, dropout=0.2),
            Dense(vocab_size, activation='softmax')
        ])
        
        model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        # 训练模型
        early_stopping = EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True)
        
        history = model.fit(
            self.X_train, self.y_train,
            epochs=20,
            batch_size=min(32, len(self.X_train)//4),
            validation_split=0.2,
            callbacks=[early_stopping],
            verbose=1
        )
        
        # 评估模型
        y_pred_proba = model.predict(self.X_test, verbose=0)
        y_pred_lstm = np.argmax(y_pred_proba, axis=1)
        
        accuracy = accuracy_score(self.y_test, y_pred_lstm)
        
        # 计算Top-3准确率
        top3_preds = np.argsort(y_pred_proba, axis=1)[:, -3:]
        top3_accuracy = np.mean([y_true in y_pred for y_true, y_pred in zip(self.y_test, top3_preds)])
        
        self.results['lstm'] = {
            'accuracy': accuracy,
            'top3_accuracy': top3_accuracy,
            'epochs_trained': len(history.history['loss'])
        }
        
        print(f"训练轮数: {len(history.history['loss'])}")
        print(f"Top-1 准确率: {accuracy:.3f}")
        print(f"Top-3 准确率: {top3_accuracy:.3f}")
        
        return accuracy

    def analyze_prediction_patterns(self):
        """分析预测模式和错误"""
        print("\n--- 预测模式分析 ---")
        
        # 分析最常见的序列模式
        sequence_patterns = Counter()
        for seq in self.X_train:
            pattern = tuple(seq)
            sequence_patterns[pattern] += 1
        
        print(f"总序列模式数: {len(sequence_patterns)}")
        print(f"最常见的5个序列模式:")
        
        for pattern, count in sequence_patterns.most_common(5):
            token_names = [self.id_to_token[id] for id in pattern]
            print(f"  {' -> '.join(token_names)}: {count}次")
        
        # 分析token分布
        token_dist = Counter([self.id_to_token[id] for id in self.y_train])
        print(f"\n最常见的5个下一动作:")
        for token, count in token_dist.most_common(5):
            print(f"  {token}: {count}次 ({count/len(self.y_train):.1%})")

    def visualize_results(self):
        """可视化实验结果"""
        if not self.results:
            print("没有结果可以可视化")
            return
        
        # 准备数据
        models = []
        accuracies = []
        
        for model_name, metrics in self.results.items():
            models.append(model_name.upper())
            accuracies.append(metrics['accuracy'])
        
        # 创建图表
        plt.figure(figsize=(12, 8))
        
        # 准确率对比
        plt.subplot(2, 2, 1)
        bars = plt.bar(models, accuracies, color=['skyblue', 'lightcoral', 'lightgreen', 'gold'][:len(models)])
        plt.title('模型准确率对比')
        plt.ylabel('Top-1 准确率')
        plt.xticks(rotation=45)
        
        # 添加数值标签
        for bar, acc in zip(bars, accuracies):
            plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                    f'{acc:.3f}', ha='center', va='bottom')
        
        # Token分布
        plt.subplot(2, 2, 2)
        token_dist = Counter([self.id_to_token[id] for id in self.y_train])
        top_tokens = dict(token_dist.most_common(10))
        plt.bar(range(len(top_tokens)), list(top_tokens.values()))
        plt.title('Top-10 动作频率分布')
        plt.ylabel('频次')
        plt.xlabel('动作类型')
        plt.xticks(range(len(top_tokens)), list(top_tokens.keys()), rotation=45)
        
        # 序列长度分析
        plt.subplot(2, 2, 3)
        sequence_lengths = [len(self.df)]  # 简化显示
        plt.bar(['总序列长度'], sequence_lengths)
        plt.title('数据集规模')
        plt.ylabel('事件数量')
        
        # 模型性能详情
        plt.subplot(2, 2, 4)
        if 'lstm' in self.results and 'top3_accuracy' in self.results['lstm']:
            lstm_metrics = ['Top-1', 'Top-3']
            lstm_scores = [self.results['lstm']['accuracy'], self.results['lstm']['top3_accuracy']]
            plt.bar(lstm_metrics, lstm_scores, color='gold')
            plt.title('LSTM模型详细性能')
            plt.ylabel('准确率')
            for i, score in enumerate(lstm_scores):
                plt.text(i, score + 0.01, f'{score:.3f}', ha='center', va='bottom')
        else:
            plt.text(0.5, 0.5, '无LSTM结果', ha='center', va='center', transform=plt.gca().transAxes)
            plt.title('LSTM模型性能')
        
        plt.tight_layout()
        output_file = 'experiment_2_prediction_results.png'
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"\n结果图表已保存至 {output_file}")
        plt.show()

    def generate_report(self):
        """生成详细的实验报告"""
        print("\n" + "="*60)
        print("下一动作预测准确率实验报告")
        print("="*60)
        
        # 数据集信息
        print(f"\n数据集信息:")
        print(f"- 总事件数: {len(self.df)}")
        print(f"- 唯一动作类型数: {len(self.vocab)}")
        print(f"- 训练序列数: {len(self.X_train)}")
        print(f"- 测试序列数: {len(self.X_test)}")
        
        # 模型性能对比
        print(f"\n模型性能对比:")
        if self.results:
            best_model = max(self.results.keys(), key=lambda k: self.results[k]['accuracy'])
            best_accuracy = self.results[best_model]['accuracy']
            
            for model_name, metrics in sorted(self.results.items(), 
                                            key=lambda x: x[1]['accuracy'], reverse=True):
                accuracy = metrics['accuracy']
                improvement = (accuracy / self.results['frequency']['accuracy'] - 1) * 100
                print(f"- {model_name.upper()}: {accuracy:.3f} ({improvement:+.1f}% vs baseline)")
            
            print(f"\n最佳模型: {best_model.upper()} (准确率: {best_accuracy:.3f})")
        
        # 分析和建议
        print(f"\n分析与建议:")
        if self.results:
            baseline_acc = self.results.get('frequency', {}).get('accuracy', 0)
            if baseline_acc > 0.5:
                print(f"- 用户行为具有较强的可预测性 (基线准确率: {baseline_acc:.1%})")
            else:
                print(f"- 用户行为相对随机 (基线准确率: {baseline_acc:.1%})")
                
            if 'lstm' in self.results:
                lstm_acc = self.results['lstm']['accuracy']
                if lstm_acc > baseline_acc * 1.1:
                    print(f"- LSTM模型显示出优势，建议进一步优化")
                else:
                    print(f"- LSTM模型提升有限，可能需要更多数据或特征工程")

def main():
    parser = argparse.ArgumentParser(description='实验二: 下一动作预测')
    parser.add_argument('input_file', help='清洗后的CSV数据文件')
    parser.add_argument('--skip-lstm', action='store_true', help='跳过LSTM模型训练')
    parser.add_argument('--ngram', type=int, default=3, help='N-gram模型的N值 (默认: 3)')
    args = parser.parse_args()
    
    if not os.path.exists(args.input_file):
        print(f"错误：找不到输入文件 {args.input_file}")
        return
    
    # 检查数据量
    df_check = pd.read_csv(args.input_file)
    if len(df_check) < 20:
        print("错误：数据量过小，无法进行有意义的训练和测试。请收集更多数据。")
        print(f"当前数据量: {len(df_check)} 行，建议至少50行以上")
        return
    
    # 运行实验
    exp = PredictionExperiment(args.input_file)
    
    if not hasattr(exp, 'X_train'):
        print("错误：数据准备失败")
        return
    
    # 运行各种模型
    exp.run_frequency_baseline()
    exp.run_markov_baseline()
    exp.run_ngram_model(args.ngram)
    
    if not args.skip_lstm:
        exp.run_lstm_model()
    
    # 分析和可视化
    exp.analyze_prediction_patterns()
    exp.visualize_results()
    exp.generate_report()

if __name__ == "__main__":
    main()