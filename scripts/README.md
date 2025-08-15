# Synapse Experiment Suite

This directory contains a complete Python script suite for Synapse plugin paper experiments.

## 🎯 Experiment Overview

This suite includes three core experiments corresponding to the main research questions of the paper:

1. **Experiment 1: FAST Feasibility Analysis** - Validate compression effects of frequency domain transforms on browser behavior data
2. **Experiment 2: Next Action Prediction Accuracy** - Compare prediction performance of different models
3. **Experiment 3: User Study Analysis** - Analyze A/B test results to evaluate the actual effectiveness of prediction features

## 📋 Environment Setup

### Required Python Packages

```bash
pip install pandas numpy matplotlib scipy seaborn scikit-learn
```

### Optional Deep Learning Support (Experiment 2)

```bash
pip install tensorflow  # For LSTM models
```

## 🚀 Quick Start

### Method 1: One-Click Run All Experiments

```bash
# After exporting data from Synapse plugin, run the complete experiment suite
python run_all_experiments.py /path/to/synapse-debug-data.json --user-group test

# Skip certain experiments
python run_all_experiments.py data.json --user-group test --skip-exp1 --skip-exp2
```

### Method 2: Step-by-Step Execution

```bash
# 1. Data cleaning
python clean_debug_data.py synapse-debug-data.json

# 2. Experiment 1: FAST feasibility
python experiment_1_feasibility.py cleaned_data.csv

# 3. Experiment 2: Prediction accuracy
python experiment_2_prediction.py cleaned_data.csv

# 4. Experiment 3: User study (requires user group specification)
python experiment_3_user_study.py cleaned_data.csv --group test
```

## 📊 Detailed Experiment Descriptions

### Experiment 1: FAST Feasibility Analysis (`experiment_1_feasibility.py`)

**Objective**: Validate energy concentration characteristics and compression potential of DCT transform on mouse trajectory data

**Input**: Cleaned CSV data file

**Output**: 
- `experiment_1_dct_analysis.png` - Comprehensive DCT analysis charts
- Console output analysis report

**Core Analysis**:
- Energy distribution of DCT coefficients
- Reconstruction error under different coefficient counts
- Compression ratio analysis
- Multi-trajectory average performance

```bash
# Basic analysis
python experiment_1_feasibility.py cleaned_data.csv

# Specify number of DCT coefficients to retain
python experiment_1_feasibility.py cleaned_data.csv --coeffs 15
```

### Experiment 2: Next Action Prediction Accuracy (`experiment_2_prediction.py`)

**Objective**: Compare prediction performance between baseline models and advanced models

**Input**: Cleaned CSV data file

**Output**:
- `experiment_2_prediction_results.png` - Model performance comparison charts
- Console output detailed performance report

**Comparison Models**:
1. **Frequency Baseline**: Always predict the most common action
2. **Markov Model**: Transition probabilities based on previous action
3. **N-gram Model**: Patterns based on previous N actions
4. **LSTM Model**: Deep learning sequence model (requires TensorFlow)

```bash
# Complete analysis (including LSTM)
python experiment_2_prediction.py cleaned_data.csv

# Skip LSTM model (if TensorFlow is not available)
python experiment_2_prediction.py cleaned_data.csv --skip-lstm

# Adjust N-gram parameters
python experiment_2_prediction.py cleaned_data.csv --ngram 5
```

### Experiment 3: User Study Analysis (`experiment_3_user_study.py`)

**Objective**: Analyze A/B test data to evaluate the impact of prediction features on user efficiency

**Input**: Single user's cleaned CSV data file

**Output**:
- `experiment_3_user_behavior_{group}.png` - User behavior visualization
- Console output user study report

**Analysis Content**:
- Task efficiency metrics (completion time, click count)
- Prediction feature impact analysis (test group only)
- Comparison analysis with control group
- User behavior pattern visualization

```bash
# Test group user analysis
python experiment_3_user_study.py user_test_data.csv --group test

# Control group user analysis
python experiment_3_user_study.py user_control_data.csv --group control

# Test group vs control group comparison
python experiment_3_user_study.py user_test_data.csv --group test --compare user_control_data.csv

# Skip chart generation
python experiment_3_user_study.py user_data.csv --group test --skip-viz
```

## 📁 Output File Descriptions

| Filename | Description |
|----------|-------------|
| `cleaned_data.csv` | Cleaned structured data |
| `data_stats.json` | Data statistics information |
| `experiment_1_dct_analysis.png` | Experiment 1: DCT analysis comprehensive charts |
| `experiment_2_prediction_results.png` | Experiment 2: Model performance comparison charts |
| `experiment_3_user_behavior_{group}.png` | Experiment 3: User behavior analysis charts |

## 🔧 Data Requirements

### Minimum Data Requirements
- **Experiment 1**: At least click events (for generating simulated trajectories)
- **Experiment 2**: At least 50 events, recommended 200+ events
- **Experiment 3**: At least 10 events, recommended one complete usage session

### Data Quality Recommendations
1. **Continuous usage data**: Ensure data comes from actual continuous usage scenarios
2. **Diverse operations**: Include different types of user operations (clicks, keyboard, navigation, etc.)
3. **Complete context**: Ensure events contain necessary context information (URL, element info, etc.)

## 🎓 Experiment Results Interpretation

### Experiment 1 Results Interpretation
- **Energy concentration rate > 90%**: Indicates first 10 DCT coefficients well preserve trajectory features
- **Compression ratio > 5:1**: Validates practical value of FAST technology
- **Reconstruction error < 20px**: Indicates acceptable accuracy after compression

### Experiment 2 Results Interpretation
- **LSTM > N-gram > Markov > Frequency**: Expected performance ranking
- **Top-1 accuracy > 30%**: Indicates user behavior has predictability
- **Top-3 accuracy > 60%**: Indicates prediction system has practical value

### Experiment 3 Results Interpretation
- **Prediction-triggered follow-up action rate > 50%**: Predictions have practical guidance value
- **Average reaction time < 3 seconds**: Users respond positively to predictions
- **Task completion time reduction**: Direct evidence of test group efficiency improvement

## 🐛 Common Issues

### Q: Experiment 2 reports "insufficient data"
A: Ensure cleaned data has at least 50 rows, recommend collecting longer usage data

### Q: Experiment 1 doesn't generate trajectory data
A: Check if original data contains coordinate information for click events (x_coord, y_coord)

### Q: LSTM model training fails
A: Check if TensorFlow is installed, or use `--skip-lstm` parameter to skip

### Q: Experiment 3 analysis results are not obvious
A: Ensure data comes from real A/B tests, and test group users actually received prediction notifications

## 📖 Advanced Usage

### Custom Experiment Parameters

```bash
# Experiment 1: Adjust DCT coefficient count
python experiment_1_feasibility.py data.csv --coeffs 20

# Experiment 2: Use 5-gram model
python experiment_2_prediction.py data.csv --ngram 5

# Experiment 3: Detailed comparison analysis
python experiment_3_user_study.py test_data.csv --group test --compare control_data.csv
```

### Batch Processing Multi-User Data

```bash
# Process multiple users' data
for file in user_*.csv; do
    python experiment_3_user_study.py "$file" --group test
done
```

## 📚 Paper Writing Recommendations

1. **Experiment 1**: Focus on DCT energy concentration characteristics and compression effects
2. **Experiment 2**: Compare different models, highlight advantages of sequence models
3. **Experiment 3**: Quantify actual impact of prediction features on user efficiency

## 🤝 Contributing

When modifying or extending experiment scripts, please ensure:
1. Maintain interface consistency with existing scripts
2. Add appropriate error handling and user prompts
3. Update this README documentation