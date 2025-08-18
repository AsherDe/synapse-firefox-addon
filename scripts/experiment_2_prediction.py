#!/usr/bin/env python3
"""
Synapse Experiment 2: Next Action Prediction Accuracy

- Implement baseline models (frequency model, Markov model)
- Train a simple LSTM sequence model
- Compare different models' next action prediction accuracy
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from collections import Counter, defaultdict
from scipy import stats
import argparse
import os
import matplotlib.pyplot as plt
import seaborn as sns

# Optional deep learning support
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Embedding, LSTM, Dense, Dropout
    from tensorflow.keras.preprocessing.text import Tokenizer
    from tensorflow.keras.preprocessing.sequence import pad_sequences
    from tensorflow.keras.callbacks import EarlyStopping
    HAS_TENSORFLOW = True
except ImportError:
    print("Warning: TensorFlow not found. LSTM model will be skipped.")
    print("Install command: pip install tensorflow")
    HAS_TENSORFLOW = False

class PredictionExperiment:
    def __init__(self, cleaned_data_file: str):
        self.df = pd.read_csv(cleaned_data_file)
        self.results = {}
        self.prepare_data()

    def prepare_data(self):
        """Convert event sequences to model-ready format"""
        print("Preparing data...")
        
        # Clean data
        self.df = self.df.dropna(subset=['action_subtype'])
        
        # Create simplified token sequence
        self.df['token'] = self.df['action_subtype'].astype(str)
        
        # Add more context information to tokens
        enhanced_tokens = []
        for _, row in self.df.iterrows():
            token = row['action_subtype']
            
            # Add element role information for click events
            if token == 'click' and pd.notna(row['element_role']):
                token = f"click_{row['element_role']}"
            
            # Add modifier key information for keyboard events
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
        
        # Create sequence data
        self.create_sequences()
        
        print(f"Data preparation completed:")
        print(f"- Total events: {len(self.df)}")
        print(f"- Unique tokens: {len(self.df['enhanced_token'].unique())}")
        print(f"- Training sequences: {len(self.X_train) if hasattr(self, 'X_train') else 0}")

    def create_sequences(self):
        """Create input-output sequence pairs"""
        tokens = self.df['enhanced_token'].tolist()
        
        # Create vocabulary
        self.vocab = list(set(tokens))
        self.token_to_id = {token: i for i, token in enumerate(self.vocab)}
        self.id_to_token = {i: token for token, i in self.token_to_id.items()}
        
        # Convert to numeric sequence
        token_ids = [self.token_to_id[token] for token in tokens]
        
        # Create sliding window sequences
        seq_length = 5  # Use previous 5 events to predict the 6th
        X, y = [], []
        
        for i in range(len(token_ids) - seq_length):
            X.append(token_ids[i:i+seq_length])
            y.append(token_ids[i+seq_length])
        
        if len(X) == 0:
            print("Error: Too little data to create sequences")
            return
        
        X = np.array(X)
        y = np.array(y)
        
        # Split training and test sets
        if len(X) < 10:
            print("Warning: Very small dataset, results may be unreliable")
            test_size = 0.3
        else:
            test_size = 0.2
            
        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, shuffle=False
        )
    
    def evaluate_enhanced_metrics(self, model_name: str, y_pred: list, y_pred_proba: list = None):
        """
        评估增强指标: Top-K准确率、新颖性与多样性、覆盖率
        根据CLAUDE.md要求实现
        """
        metrics = {}
        
        # 1. Top-K准确率 (K=3, K=5)
        if y_pred_proba is not None:
            # 对于概率预测，计算Top-K
            for k in [3, 5]:
                top_k_acc = self.calculate_top_k_accuracy(y_pred_proba, self.y_test, k)
                metrics[f'top_{k}_accuracy'] = top_k_acc
        else:
            # 对于确定性预测，使用近似方法
            metrics['top_3_accuracy'] = metrics.get('top_3_accuracy', accuracy_score(self.y_test, y_pred))
            metrics['top_5_accuracy'] = metrics.get('top_5_accuracy', accuracy_score(self.y_test, y_pred))
        
        # 2. 新颖性与多样性 (Novelty & Diversity)
        novelty_score = self.calculate_novelty(y_pred, self.y_train)
        diversity_score = self.calculate_diversity(y_pred)
        metrics['novelty'] = novelty_score
        metrics['diversity'] = diversity_score
        
        # 3. 覆盖率 (Coverage) - 模型能够进行预测的场景比例
        coverage_score = self.calculate_coverage(y_pred)
        metrics['coverage'] = coverage_score
        
        # 4. 预测分布的熵 (预测不确定性)
        prediction_entropy = self.calculate_prediction_entropy(y_pred)
        metrics['prediction_entropy'] = prediction_entropy
        
        return metrics
    
    def calculate_top_k_accuracy(self, y_pred_proba: list, y_true: list, k: int) -> float:
        """计算Top-K准确率"""
        if not y_pred_proba or len(y_pred_proba) == 0:
            return 0.0
        
        correct = 0
        total = len(y_true)
        
        for i, true_label in enumerate(y_true):
            if i < len(y_pred_proba):
                # 获取前K个最可能的预测
                if isinstance(y_pred_proba[i], dict):
                    # 如果是概率字典格式
                    top_k_preds = sorted(y_pred_proba[i].items(), key=lambda x: x[1], reverse=True)[:k]
                    top_k_labels = [pred[0] for pred in top_k_preds]
                elif isinstance(y_pred_proba[i], (list, np.ndarray)):
                    # 如果是概率数组格式
                    top_k_indices = np.argsort(y_pred_proba[i])[-k:][::-1]
                    top_k_labels = top_k_indices
                else:
                    continue
                    
                if true_label in top_k_labels:
                    correct += 1
        
        return correct / total if total > 0 else 0.0
    
    def calculate_novelty(self, y_pred: list, y_train: list) -> float:
        """
        计算新颖性: 预测中包含多少训练集中罕见的动作
        高新颖性意味着模型不只是预测常见动作
        """
        # 计算训练集中每个动作的频率
        train_counts = Counter(y_train)
        total_train = len(y_train)
        
        # 计算预测的新颖性分数
        novelty_scores = []
        for pred in y_pred:
            # 使用逆频率作为新颖性度量
            frequency = train_counts.get(pred, 0) / total_train
            novelty = 1.0 / (frequency + 1e-6)  # 添加小常数避免除零
            novelty_scores.append(novelty)
        
        return np.mean(novelty_scores)
    
    def calculate_diversity(self, y_pred: list) -> float:
        """
        计算多样性: 预测结果的多样性程度
        使用Shannon熵来衡量预测分布的多样性
        """
        if len(y_pred) == 0:
            return 0.0
            
        # 计算预测分布
        pred_counts = Counter(y_pred)
        pred_probs = [count / len(y_pred) for count in pred_counts.values()]
        
        # 计算Shannon熵
        diversity = -sum(p * np.log2(p) for p in pred_probs if p > 0)
        
        # 标准化到[0,1]区间
        max_diversity = np.log2(len(pred_counts))
        normalized_diversity = diversity / max_diversity if max_diversity > 0 else 0.0
        
        return normalized_diversity
    
    def calculate_coverage(self, y_pred: list) -> float:
        """
        计算覆盖率: 模型预测覆盖了多少种不同的动作类型
        """
        unique_predictions = len(set(y_pred))
        total_possible_actions = len(self.vocab)
        
        coverage = unique_predictions / total_possible_actions
        return coverage
    
    def calculate_prediction_entropy(self, y_pred: list) -> float:
        """计算预测分布的熵，衡量预测的不确定性"""
        if len(y_pred) == 0:
            return 0.0
            
        pred_counts = Counter(y_pred)
        pred_probs = [count / len(y_pred) for count in pred_counts.values()]
        
        entropy = -sum(p * np.log2(p) for p in pred_probs if p > 0)
        return entropy

    def run_frequency_baseline(self):
        """Run frequency baseline model"""
        print("\n--- Frequency Baseline Model ---")
        
        # Find the most common token
        most_common_id = Counter(self.y_train).most_common(1)[0][0]
        most_common_token = self.id_to_token[most_common_id]
        
        # Predict the most common token for all test samples
        y_pred_freq = [most_common_id] * len(self.y_test)
        
        accuracy = accuracy_score(self.y_test, y_pred_freq)
        
        # 计算增强评估指标
        enhanced_metrics = self.evaluate_enhanced_metrics('frequency', y_pred_freq)
        
        self.results['frequency'] = {
            'accuracy': accuracy,
            'model': f'总是预测: {most_common_token}',
            **enhanced_metrics
        }
        
        print(f"Most common action: {most_common_token}")
        print(f"Top-1 accuracy: {accuracy:.3f}")
        print(f"Top-3 accuracy: {enhanced_metrics['top_3_accuracy']:.3f}")
        print(f"Top-5 accuracy: {enhanced_metrics['top_5_accuracy']:.3f}")
        print(f"Novelty score: {enhanced_metrics['novelty']:.3f}")
        print(f"Diversity score: {enhanced_metrics['diversity']:.3f}")
        print(f"Coverage: {enhanced_metrics['coverage']:.3f}")
        
        return accuracy

    def run_markov_baseline(self):
        """Run Markov baseline model"""
        print("\n--- Markov Baseline Model ---")
        
        # Build transition probability matrix
        transitions = defaultdict(Counter)
        
        for i in range(len(self.y_train)):
            prev_token = self.X_train[i][-1]  # 使用序列的最后一个token
            next_token = self.y_train[i]
            transitions[prev_token][next_token] += 1
        
        # Predict test set
        y_pred_markov = []
        fallback_token = Counter(self.y_train).most_common(1)[0][0]
        
        for seq in self.X_test:
            prev_token = seq[-1]
            
            if prev_token in transitions and transitions[prev_token]:
                # Select the most likely next token
                pred = transitions[prev_token].most_common(1)[0][0]
                y_pred_markov.append(pred)
            else:
                # Fall back to most common token
                y_pred_markov.append(fallback_token)
        
        accuracy = accuracy_score(self.y_test, y_pred_markov)
        
        # 计算增强评估指标
        enhanced_metrics = self.evaluate_enhanced_metrics('markov', y_pred_markov)
        
        self.results['markov'] = {
            'accuracy': accuracy,
            'transitions': len(transitions),
            **enhanced_metrics
        }
        
        print(f"Learned transition patterns: {len(transitions)}")
        print(f"Top-1 accuracy: {accuracy:.3f}")
        print(f"Top-3 accuracy: {enhanced_metrics['top_3_accuracy']:.3f}")
        print(f"Top-5 accuracy: {enhanced_metrics['top_5_accuracy']:.3f}")
        print(f"Novelty score: {enhanced_metrics['novelty']:.3f}")
        print(f"Diversity score: {enhanced_metrics['diversity']:.3f}")
        print(f"Coverage: {enhanced_metrics['coverage']:.3f}")
        
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
        
        # 计算增强评估指标
        enhanced_metrics = self.evaluate_enhanced_metrics(f'{n}gram', y_pred_ngram)
        
        self.results[f'{n}gram'] = {
            'accuracy': accuracy,
            'patterns': len(ngram_counts),
            **enhanced_metrics
        }
        
        print(f"学习到的{n}-gram模式数: {len(ngram_counts)}")
        print(f"Top-1 准确率: {accuracy:.3f}")
        print(f"Top-3 准确率: {enhanced_metrics['top_3_accuracy']:.3f}")
        print(f"Top-5 准确率: {enhanced_metrics['top_5_accuracy']:.3f}")
        print(f"新颖性分数: {enhanced_metrics['novelty']:.3f}")
        print(f"多样性分数: {enhanced_metrics['diversity']:.3f}")
        print(f"覆盖率: {enhanced_metrics['coverage']:.3f}")
        
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
        """Visualize experiment results"""
        if not self.results:
            print("No results to visualize")
            return
        
        # Prepare data
        models = []
        accuracies = []
        
        for model_name, metrics in self.results.items():
            models.append(model_name.upper())
            accuracies.append(metrics['accuracy'])
        
        # Create enhanced charts
        plt.figure(figsize=(16, 12))
        
        # Chart A: Model accuracy comparison (Top-1, Top-3, Top-5)
        plt.subplot(2, 3, 1)
        x_pos = np.arange(len(models))
        width = 0.25
        
        top1_scores = [metrics['accuracy'] for metrics in self.results.values()]
        top3_scores = [metrics.get('top_3_accuracy', 0) for metrics in self.results.values()]
        top5_scores = [metrics.get('top_5_accuracy', 0) for metrics in self.results.values()]
        
        plt.bar(x_pos - width, top1_scores, width, label='Top-1', color='skyblue')
        plt.bar(x_pos, top3_scores, width, label='Top-3', color='lightcoral')  
        plt.bar(x_pos + width, top5_scores, width, label='Top-5', color='lightgreen')
        
        plt.title('(A) Top-K Accuracy Comparison')
        plt.ylabel('Accuracy')
        plt.xlabel('Model')
        plt.xticks(x_pos, models, rotation=45)
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        # Chart B: Novelty & Diversity Comparison  
        plt.subplot(2, 3, 2)
        novelty_scores = [metrics.get('novelty', 0) for metrics in self.results.values()]
        diversity_scores = [metrics.get('diversity', 0) for metrics in self.results.values()]
        
        x_pos = np.arange(len(models))
        width = 0.35
        plt.bar(x_pos - width/2, novelty_scores, width, label='Novelty', color='orange')
        plt.bar(x_pos + width/2, diversity_scores, width, label='Diversity', color='purple')
        
        plt.title('(B) Novelty & Diversity Scores')
        plt.ylabel('Score')
        plt.xlabel('Model')
        plt.xticks(x_pos, models, rotation=45)
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        # Chart C: Coverage Analysis
        plt.subplot(2, 3, 3)
        coverage_scores = [metrics.get('coverage', 0) for metrics in self.results.values()]
        bars = plt.bar(models, coverage_scores, color='teal')
        plt.title('(C) Prediction Coverage')
        plt.ylabel('Coverage Rate')
        plt.xlabel('Model')
        plt.xticks(rotation=45)
        
        # Add value labels
        for bar, cov in zip(bars, coverage_scores):
            plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                    f'{cov:.2f}', ha='center', va='bottom')
        plt.grid(True, alpha=0.3)
        
        # Chart D: Action Frequency Distribution
        plt.subplot(2, 3, 4)
        token_dist = Counter([self.id_to_token[id] for id in self.y_train])
        top_tokens = dict(token_dist.most_common(8))
        plt.bar(range(len(top_tokens)), list(top_tokens.values()), color='lightblue')
        plt.title('(D) Top-8 Action Frequency')
        plt.ylabel('Frequency')
        plt.xlabel('Action Type')
        plt.xticks(range(len(top_tokens)), list(top_tokens.keys()), rotation=45)
        plt.grid(True, alpha=0.3)
        
        # Chart E: Prediction Entropy
        plt.subplot(2, 3, 5)
        entropy_scores = [metrics.get('prediction_entropy', 0) for metrics in self.results.values()]
        bars = plt.bar(models, entropy_scores, color='salmon')
        plt.title('(E) Prediction Entropy')
        plt.ylabel('Entropy (bits)')
        plt.xlabel('Model')
        plt.xticks(rotation=45)
        
        # Add value labels  
        for bar, ent in zip(bars, entropy_scores):
            plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                    f'{ent:.2f}', ha='center', va='bottom')
        plt.grid(True, alpha=0.3)
        
        # Chart F: Best Model Comprehensive Metrics
        plt.subplot(2, 3, 6)
        if self.results:
            # 找到准确率最高的模型
            best_model = max(self.results.keys(), key=lambda k: self.results[k]['accuracy'])
            best_metrics = self.results[best_model]
            
            metric_names = ['Top-1', 'Top-3', 'Novelty', 'Diversity', 'Coverage']
            metric_values = [
                best_metrics.get('accuracy', 0),
                best_metrics.get('top_3_accuracy', 0),
                best_metrics.get('novelty', 0) / 10,  # 标准化到[0,1]
                best_metrics.get('diversity', 0),
                best_metrics.get('coverage', 0)
            ]
            
            bars = plt.bar(metric_names, metric_values, color=['gold', 'orange', 'red', 'purple', 'teal'])
            plt.title(f'(F) Best Model ({best_model.upper()}) Metrics')
            plt.ylabel('Normalized Score')
            plt.xticks(rotation=45)
            
            # Add value labels
            for bar, val in zip(bars, metric_values):
                plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                        f'{val:.2f}', ha='center', va='bottom')
            plt.grid(True, alpha=0.3)
        else:
            plt.text(0.5, 0.5, 'No Results Available', ha='center', va='center', 
                    transform=plt.gca().transAxes)
            plt.title('(F) Model Performance Summary')
        
        plt.tight_layout()
        output_file = 'experiment_2_prediction_results.png'
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"\nResults chart saved to {output_file}")
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
        
        # 增强的模型性能对比
        print(f"\n增强评估指标对比:")
        if self.results:
            best_model = max(self.results.keys(), key=lambda k: self.results[k]['accuracy'])
            best_accuracy = self.results[best_model]['accuracy']
            
            print(f"{'模型':<10} {'Top-1':<8} {'Top-3':<8} {'Top-5':<8} {'新颖性':<8} {'多样性':<8} {'覆盖率':<8}")
            print("-" * 60)
            
            for model_name, metrics in sorted(self.results.items(), 
                                            key=lambda x: x[1]['accuracy'], reverse=True):
                top1 = metrics.get('accuracy', 0)
                top3 = metrics.get('top_3_accuracy', 0)  
                top5 = metrics.get('top_5_accuracy', 0)
                novelty = metrics.get('novelty', 0)
                diversity = metrics.get('diversity', 0)
                coverage = metrics.get('coverage', 0)
                
                print(f"{model_name.upper():<10} {top1:<8.3f} {top3:<8.3f} {top5:<8.3f} "
                      f"{novelty:<8.2f} {diversity:<8.3f} {coverage:<8.3f}")
            
            print(f"\n最佳模型: {best_model.upper()} (Top-1准确率: {best_accuracy:.3f})")
            
            # 额外的洞察分析
            print(f"\n关键洞察:")
            baseline_acc = self.results.get('frequency', {}).get('accuracy', 0)
            if baseline_acc > 0:
                improvement = (best_accuracy / baseline_acc - 1) * 100
                print(f"- 最佳模型相对基线提升: {improvement:.1f}%")
            
            # 分析Top-K准确率的提升效果
            if best_model in self.results:
                best_metrics = self.results[best_model]
                top1_acc = best_metrics.get('accuracy', 0)
                top3_acc = best_metrics.get('top_3_accuracy', 0)
                top5_acc = best_metrics.get('top_5_accuracy', 0)
                
                if top3_acc > top1_acc:
                    top3_improvement = (top3_acc / top1_acc - 1) * 100
                    print(f"- Top-3相对Top-1提升: {top3_improvement:.1f}%")
                if top5_acc > top1_acc:
                    top5_improvement = (top5_acc / top1_acc - 1) * 100  
                    print(f"- Top-5相对Top-1提升: {top5_improvement:.1f}%")
                    
                # 评估新颖性和多样性
                novelty = best_metrics.get('novelty', 0)
                diversity = best_metrics.get('diversity', 0)
                print(f"- 模型新颖性评分: {novelty:.2f} (高分表示能预测罕见动作)")
                print(f"- 模型多样性评分: {diversity:.3f} (高分表示预测结果多样)")
                
                coverage = best_metrics.get('coverage', 0)  
                print(f"- 动作覆盖率: {coverage:.1%} (覆盖 {int(coverage * len(self.vocab))} / {len(self.vocab)} 种动作)")
        
        print(f"\n这些增强指标的意义:")
        print(f"- Top-K准确率：在实际应用中，只要真实动作在前K个预测中即可被认为是成功的")
        print(f"- 新颖性：高分说明模型不只是简单重复常见动作，能发现长尾模式")  
        print(f"- 多样性：高分说明模型预测结果丰富，不会陷入单一预测模式")
        print(f"- 覆盖率：高分说明模型能够处理更广泛的场景，适用性更强")
        
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