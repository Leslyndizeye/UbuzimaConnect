import json
with open('Ubuzima_Connect_notebook.ipynb', encoding='utf-8') as f:
    nb = json.load(f)
nb.setdefault('metadata', {}).setdefault('widgets', {})['state'] = {}
with open('Ubuzima_Connect_notebook.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)
print('Fixed!')