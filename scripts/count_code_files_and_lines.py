import os


import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_FOLDERS = ['scripts', 'src']
TARGET_EXTENSIONS = ['.py', '.ts']

file_count = 0
line_count = 0

def is_code_line(line, ext):
    line = line.strip()
    if not line:
        return False
    if ext == '.py':
        return not line.startswith('#')
    if ext == '.ts':
        return not line.startswith('//')
    return True

for folder in TARGET_FOLDERS:
    folder_path = os.path.join(BASE_DIR, folder)
    for root, dirs, files in os.walk(folder_path):
        for fname in files:
            for ext in TARGET_EXTENSIONS:
                if fname.endswith(ext):
                    file_count += 1
                    fpath = os.path.join(root, fname)
                    try:
                        with open(fpath, 'r', encoding='utf-8') as f:
                            lines = f.readlines()
                            code_lines = [l for l in lines if is_code_line(l, ext)]
                            line_count += len(code_lines)
                    except Exception as e:
                        print(f"Error reading {fpath}: {e}")
                    break

print(f"Total .py and .ts files in scripts and src: {file_count}")
print(f"Total code lines (excluding empty and comment lines): {line_count}")
