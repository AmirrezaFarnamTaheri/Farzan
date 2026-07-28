$(python - <<'PY'
from pathlib import Path
p=Path('far/src/views/settingsRoute.js')
print(p.read_text())
PY
)